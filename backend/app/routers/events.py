import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
import asyncio

from app.database import get_db
from app.dependencies import get_admin
from app.rate_limit import limiter
from app.models.user import User
from app.models.event import EventRequest, EventStatus
from app.schemas.event import EventRequestCreate, EventRequestUpdate, EventRequestOut
from app.services.email import send_event_enquiry_confirmation_email, send_admin_event_enquiry_email
from app.config import settings


router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventRequestOut)
@limiter.limit("5/minute")
async def create_event_request(
    request: Request,
    data: EventRequestCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Public endpoint: allows guest users or anonymous visitors to submit event inquiries.
    """
    event_req = EventRequest(
        destination=data.destination,
        hotel=data.hotel,
        nature_of_event=data.nature_of_event,
        event_start_date=data.event_start_date,
        event_end_date=data.event_end_date,
        no_of_guests=data.no_of_guests,
        requires_rooms=data.requires_rooms,
        no_of_rooms=data.no_of_rooms if data.requires_rooms else 0,
        additional_details=data.additional_details,
        name=data.name,
        phone=data.phone,
        email=str(data.email),
        status=EventStatus.pending,
    )
    db.add(event_req)
    await db.commit()
    await db.refresh(event_req)

    # Generate a short reference from the UUID
    event_ref = f"EV-{str(event_req.id).upper()[:8]}"
    start_str = str(data.event_start_date)
    end_str = str(data.event_end_date) if data.event_end_date else start_str

    # Send emails in the background (non-blocking)
    asyncio.create_task(send_event_enquiry_confirmation_email(
        to_email=str(data.email),
        name=data.name,
        event_ref=event_ref,
        nature_of_event=data.nature_of_event,
        destination=data.destination,
        hotel=data.hotel or "",
        event_start_date=start_str,
        event_end_date=end_str,
        no_of_guests=str(data.no_of_guests),
        requires_rooms=data.requires_rooms,
        no_of_rooms=data.no_of_rooms or 0,
        additional_details=data.additional_details or "",
        phone=data.phone,
    ))
    asyncio.create_task(send_admin_event_enquiry_email(
        admin_email=settings.ADMIN_EMAIL,
        name=data.name,
        event_ref=event_ref,
        nature_of_event=data.nature_of_event,
        destination=data.destination,
        hotel=data.hotel or "",
        event_start_date=start_str,
        event_end_date=end_str,
        no_of_guests=str(data.no_of_guests),
        phone=data.phone,
        guest_email=str(data.email),
        additional_details=data.additional_details or "",
    ))

    # Send push notification to admin devices
    from app.services.push import send_push_to_admins
    asyncio.create_task(send_push_to_admins(
        title=f"New Event Enquiry — {data.nature_of_event}",
        body=f"{data.name} · {data.destination} · {data.no_of_guests} guests",
        url="/admin",
    ))

    return event_req


@router.get("/admin/all", response_model=list[EventRequestOut])
async def list_admin_events(
    status: EventStatus | None = Query(None),
    search: str | None = Query(None),
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin-only endpoint: lists all event inquiries with optional search and status filter.
    """
    query = select(EventRequest)
    if status:
        query = query.where(EventRequest.status == status)
    if search:
        query = query.where(
            or_(
                EventRequest.name.ilike(f"%{search}%"),
                EventRequest.email.ilike(f"%{search}%"),
                EventRequest.phone.ilike(f"%{search}%"),
                EventRequest.destination.ilike(f"%{search}%"),
                EventRequest.hotel.ilike(f"%{search}%"),
            )
        )
    query = query.order_by(EventRequest.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/admin/{event_id}", response_model=EventRequestOut)
async def update_event_request_status(
    event_id: uuid.UUID,
    data: EventRequestUpdate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin-only endpoint: updates the status of an event inquiry.
    """
    event_req = await db.get(EventRequest, event_id)
    if not event_req:
        raise HTTPException(status_code=404, detail="Event request not found")

    event_req.status = data.status
    await db.commit()
    await db.refresh(event_req)
    return event_req
