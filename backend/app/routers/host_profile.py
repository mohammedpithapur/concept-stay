import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, utc_now
from app.dependencies import get_admin, get_host_any_status
from app.models.host_profile import HOST_DOC_TYPES, HostDocument, HostProfile
from app.models.user import User
from app.schemas.host_profile import (
    CompletenessOut, HostDocumentOut, HostProfileIn, HostProfileOut, KycDetailOut, KycDocumentAdminOut,
    KycListItem, KycRejectIn,
)
from app.services import private_storage
from app.services.crypto import decrypt_text, encrypt_text, mask_tail
from app.services.doc_upload import read_validated_upload
from app.services.upload import UploadStorageError

router = APIRouter(tags=["host-profile"])

MAX_DOCUMENTS = 12


async def _get_or_create(db: AsyncSession, user: User) -> HostProfile:
    profile = await db.get(HostProfile, user.id)
    if not profile:
        profile = HostProfile(user_id=user.id, kyc_status="incomplete")
        db.add(profile)
        await db.flush()
    return profile


async def _documents(db: AsyncSession, user_id) -> list[HostDocument]:
    result = await db.execute(select(HostDocument).where(HostDocument.user_id == user_id).order_by(HostDocument.uploaded_at))
    return list(result.scalars().all())


def _missing(profile: HostProfile, docs: list[HostDocument]) -> list[str]:
    types = {d.doc_type for d in docs}
    checks = [
        ("legal_name", bool(profile.legal_name)),
        ("pan_number", bool(profile.pan_enc)),
        ("bank_holder", bool(profile.bank_holder)),
        ("bank_account_number", bool(profile.bank_account_enc)),
        ("bank_ifsc", bool(profile.bank_ifsc)),
        ("pan_document", "pan" in types),
        ("id_document", bool(types & {"aadhaar", "passport"})),
    ]
    return [name for name, ok in checks if not ok]


def _resync_status(profile: HostProfile, docs: list[HostDocument], documents_changed: bool = False) -> None:
    """Keep kyc_status honest after every change: complete profiles wait for review, incomplete ones say so.

    Adding or removing a document on a verified profile sends it back for review: the admin verified those files.
    """
    if documents_changed and profile.kyc_status == "verified" and not _missing(profile, docs):
        profile.kyc_status = "submitted"
        profile.submitted_at = utc_now()
        profile.verified_at = None
    if _missing(profile, docs):
        profile.kyc_status = "incomplete"
        profile.verified_at = None
    elif profile.kyc_status in ("incomplete", "rejected"):
        profile.kyc_status = "submitted"
        profile.submitted_at = utc_now()
        profile.rejection_reason = None


def _profile_out(profile: HostProfile, docs: list[HostDocument]) -> HostProfileOut:
    return HostProfileOut(
        legal_name=profile.legal_name,
        phone=profile.phone,
        pan_masked=mask_tail(decrypt_text(profile.pan_enc)) if profile.pan_enc else None,
        aadhaar_last4=profile.aadhaar_last4,
        gst_number=profile.gst_number,
        bank_holder=profile.bank_holder,
        bank_account_masked=mask_tail(decrypt_text(profile.bank_account_enc)) if profile.bank_account_enc else None,
        bank_ifsc=profile.bank_ifsc,
        kyc_status=profile.kyc_status,
        rejection_reason=profile.rejection_reason,
        submitted_at=profile.submitted_at,
        verified_at=profile.verified_at,
        documents=[HostDocumentOut.model_validate(d) for d in docs],
    )


# ── Host ─────────────────────────────────────────────────────────────────────

@router.get("/host/profile", response_model=HostProfileOut)
async def get_my_profile(host: User = Depends(get_host_any_status), db: AsyncSession = Depends(get_db)):
    profile = await _get_or_create(db, host)
    docs = await _documents(db, host.id)
    await db.commit()
    return _profile_out(profile, docs)


@router.put("/host/profile", response_model=HostProfileOut)
async def save_my_profile(
    data: HostProfileIn, host: User = Depends(get_host_any_status), db: AsyncSession = Depends(get_db)
):
    profile = await _get_or_create(db, host)
    values = data.model_dump(exclude_unset=True)
    sensitive_changed = False
    for field in ("legal_name", "phone", "aadhaar_last4", "gst_number", "bank_holder", "bank_ifsc"):
        if field in values:
            if field in ("bank_holder", "bank_ifsc") and values[field] != getattr(profile, field):
                sensitive_changed = True
            setattr(profile, field, values[field])
    if values.get("pan_number"):
        profile.pan_enc = encrypt_text(values["pan_number"])
        sensitive_changed = True
    if values.get("bank_account_number"):
        profile.bank_account_enc = encrypt_text(values["bank_account_number"])
        sensitive_changed = True

    docs = await _documents(db, host.id)
    if profile.kyc_status == "verified" and sensitive_changed:
        profile.kyc_status = "submitted"  # payout details changed: the admin looks again
        profile.submitted_at = utc_now()
        profile.verified_at = None
    _resync_status(profile, docs)
    await db.commit()
    return _profile_out(profile, docs)


@router.get("/host/profile/completeness", response_model=CompletenessOut)
async def profile_completeness(host: User = Depends(get_host_any_status), db: AsyncSession = Depends(get_db)):
    profile = await _get_or_create(db, host)
    docs = await _documents(db, host.id)
    await db.commit()
    missing = _missing(profile, docs)
    return CompletenessOut(complete=not missing, missing=missing, kyc_status=profile.kyc_status)


@router.post("/host/profile/documents", response_model=HostDocumentOut, status_code=201)
async def upload_my_document(
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    host: User = Depends(get_host_any_status),
    db: AsyncSession = Depends(get_db),
):
    if doc_type not in HOST_DOC_TYPES:
        raise HTTPException(status_code=422, detail=f"doc_type must be one of: {', '.join(HOST_DOC_TYPES)}")
    content, mime = await read_validated_upload(file)
    profile = await _get_or_create(db, host)
    docs = await _documents(db, host.id)
    if len(docs) >= MAX_DOCUMENTS:
        raise HTTPException(status_code=409, detail="Too many documents; delete one first")
    try:
        path = await private_storage.upload_private(f"host-kyc/{host.id}", file.filename or "document", content, mime)
    except UploadStorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    doc = HostDocument(
        user_id=host.id, doc_type=doc_type, storage_path=path,
        filename=(file.filename or "document")[:255], mime=mime, size=len(content),
    )
    db.add(doc)
    docs.append(doc)
    _resync_status(profile, docs, documents_changed=True)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.delete("/host/profile/documents/{doc_id}", status_code=204)
async def delete_my_document(
    doc_id: uuid.UUID, host: User = Depends(get_host_any_status), db: AsyncSession = Depends(get_db)
):
    doc = await db.get(HostDocument, doc_id)
    if not doc or doc.user_id != host.id:
        raise HTTPException(status_code=404, detail="Document not found")
    path = doc.storage_path
    await db.delete(doc)
    await db.flush()
    profile = await _get_or_create(db, host)
    _resync_status(profile, await _documents(db, host.id), documents_changed=True)
    await db.commit()
    try:
        await private_storage.delete_private(path)
    except UploadStorageError:
        pass  # the row is gone; an orphaned file in the private bucket is never served


# ── Admin ────────────────────────────────────────────────────────────────────

@router.get("/admin/kyc", response_model=list[KycListItem])
async def admin_list_kyc(
    status: str | None = Query(None, pattern="^(incomplete|submitted|verified|rejected)$"),
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(HostProfile, User)
        .join(User, User.id == HostProfile.user_id)
        .order_by(HostProfile.submitted_at.desc().nullslast(), HostProfile.created_at.desc())
    )
    if status:
        query = query.where(HostProfile.kyc_status == status)
    rows = (await db.execute(query)).all()
    return [
        KycListItem(
            user_id=u.id, email=u.email, full_name=u.full_name, legal_name=p.legal_name,
            kyc_status=p.kyc_status, submitted_at=p.submitted_at,
        )
        for p, u in rows
    ]


@router.get("/admin/kyc/{user_id}", response_model=KycDetailOut)
async def admin_get_kyc(user_id: uuid.UUID, admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)):
    profile = await db.get(HostProfile, user_id)
    user = await db.get(User, user_id)
    if not profile or not user:
        raise HTTPException(status_code=404, detail="Host profile not found")
    docs = await _documents(db, user_id)
    try:
        urls = [await private_storage.signed_url(d.storage_path, 300) for d in docs]
    except UploadStorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    base = _profile_out(profile, docs).model_dump(exclude={"documents"})
    return KycDetailOut(
        **base,
        user_id=user.id,
        email=user.email,
        pan_number=decrypt_text(profile.pan_enc) if profile.pan_enc else None,
        bank_account_number=decrypt_text(profile.bank_account_enc) if profile.bank_account_enc else None,
        documents=[KycDocumentAdminOut(**HostDocumentOut.model_validate(d).model_dump(), signed_url=u) for d, u in zip(docs, urls)],
    )


async def _decide(db: AsyncSession, user_id: uuid.UUID) -> tuple[HostProfile, list[HostDocument]]:
    profile = await db.get(HostProfile, user_id, with_for_update=True)
    if not profile:
        raise HTTPException(status_code=404, detail="Host profile not found")
    return profile, await _documents(db, user_id)


@router.post("/admin/kyc/{user_id}/verify", response_model=HostProfileOut)
async def admin_verify_kyc(user_id: uuid.UUID, admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)):
    profile, docs = await _decide(db, user_id)
    if _missing(profile, docs):
        raise HTTPException(status_code=409, detail="The host profile is incomplete")
    profile.kyc_status = "verified"
    profile.verified_at = utc_now()
    profile.rejection_reason = None
    await db.commit()
    return _profile_out(profile, docs)


@router.post("/admin/kyc/{user_id}/reject", response_model=HostProfileOut)
async def admin_reject_kyc(
    user_id: uuid.UUID, data: KycRejectIn, admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)
):
    profile, docs = await _decide(db, user_id)
    profile.kyc_status = "rejected"
    profile.verified_at = None
    profile.rejection_reason = data.reason
    await db.commit()
    return _profile_out(profile, docs)
