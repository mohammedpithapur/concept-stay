import uuid
from datetime import date, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, today_ist, utc_now
from app.dependencies import get_current_user
from app.models.booking import Booking
from app.models.connection import Connection
from app.models.property import Property
from app.models.user import User
from app.rate_limit import limiter
from app.services.connections import (
    co_guest_rows, connection_status_for, first_name, is_eligible_stay, pair_connection, request_window_open,
)
from app.services.push import send_push_to_user

router = APIRouter(tags=["connections"])


class CoGuestOut(BaseModel):
    user_id: uuid.UUID
    first_name: str
    check_in: date
    check_out: date
    connection_status: str


class ConnectionRequestIn(BaseModel):
    to_user_id: uuid.UUID
    booking_id: uuid.UUID


class ConnectionOut(BaseModel):
    id: uuid.UUID
    status: str
    created_at: datetime


class PendingOut(BaseModel):
    """A request that has not been accepted yet: a first name and the shared stay only."""

    id: uuid.UUID
    user_id: uuid.UUID
    first_name: str
    property_name: str
    check_in: date
    check_out: date
    created_at: datetime


class ConnectedOut(BaseModel):
    """Only accepted connections carry contact details."""

    id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    email: str
    phone: str | None
    property_name: str


class ConnectionsOut(BaseModel):
    incoming: list[PendingOut]
    outgoing: list[PendingOut]
    connected: list[ConnectedOut]


async def _own_booking(db: AsyncSession, booking_id: uuid.UUID, user: User) -> Booking:
    booking = await db.get(Booking, booking_id)
    if not booking or booking.guest_id != user.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not is_eligible_stay(booking):
        raise HTTPException(status_code=409, detail="Travel buddies are available for paid bookings")
    return booking


def _require_opted_in(user: User) -> None:
    if not user.open_to_connections:
        raise HTTPException(status_code=403, detail="Turn on travel buddies in your profile to see other guests")


@router.get("/bookings/{booking_id}/co-guests", response_model=list[CoGuestOut])
async def list_co_guests(
    booking_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    booking = await _own_booking(db, booking_id, user)
    _require_opted_in(user)
    out = []
    for other, stay in await co_guest_rows(db, booking):
        conn = await pair_connection(db, user.id, other.id)
        out.append(CoGuestOut(
            user_id=other.id, first_name=first_name(other.full_name), check_in=stay.check_in, check_out=stay.check_out,
            connection_status=connection_status_for(conn, user.id),
        ))
    return out


@router.post("/connections", response_model=ConnectionOut, status_code=201)
@limiter.limit("10/hour")
async def request_connection(
    request: Request,
    data: ConnectionRequestIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    booking = await _own_booking(db, data.booking_id, user)
    _require_opted_in(user)
    if not request_window_open(booking, today_ist()):
        raise HTTPException(status_code=409, detail="The window to connect with guests from this stay has closed")
    if not any(other.id == data.to_user_id for other, _ in await co_guest_rows(db, booking)):
        raise HTTPException(status_code=403, detail="You can only connect with guests who shared your stay")
    if await pair_connection(db, user.id, data.to_user_id):
        raise HTTPException(status_code=409, detail="You already have a request with this guest")

    conn = Connection(
        requester_id=user.id, addressee_id=data.to_user_id, property_id=booking.property_id, booking_id=booking.id
    )
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    background_tasks.add_task(
        send_push_to_user, data.to_user_id, "New travel buddy request",
        f"{first_name(user.full_name)} would like to connect.", "/dashboard?tab=buddies",
    )
    return ConnectionOut(id=conn.id, status=conn.status, created_at=conn.created_at)


@router.get("/connections", response_model=ConnectionsOut)
async def list_connections(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Connection).where(
                or_(Connection.requester_id == user.id, Connection.addressee_id == user.id),
                Connection.status.in_(("pending", "accepted")),
            ).order_by(Connection.created_at.desc())
        )
    ).scalars().all()
    incoming, outgoing, connected = [], [], []
    for conn in rows:
        other_id = conn.addressee_id if conn.requester_id == user.id else conn.requester_id
        other = await db.get(User, other_id)
        prop = await db.get(Property, conn.property_id)
        booking = await db.get(Booking, conn.booking_id)
        if not other or not other.is_active:
            continue
        if conn.status == "accepted":
            connected.append(ConnectedOut(
                id=conn.id, user_id=other.id, full_name=other.full_name, email=other.email, phone=other.phone,
                property_name=prop.name if prop else "",
            ))
            continue
        item = PendingOut(
            id=conn.id, user_id=other.id, first_name=first_name(other.full_name),
            property_name=prop.name if prop else "", check_in=booking.check_in, check_out=booking.check_out,
            created_at=conn.created_at,
        )
        (outgoing if conn.requester_id == user.id else incoming).append(item)
    return ConnectionsOut(incoming=incoming, outgoing=outgoing, connected=connected)


async def _party_connection(db: AsyncSession, conn_id: uuid.UUID, user: User) -> Connection:
    conn = await db.get(Connection, conn_id, with_for_update=True)
    if not conn or user.id not in (conn.requester_id, conn.addressee_id):
        raise HTTPException(status_code=404, detail="Connection not found")
    return conn


async def _respond(db: AsyncSession, conn_id: uuid.UUID, user: User, new_status: str) -> Connection:
    conn = await _party_connection(db, conn_id, user)
    if conn.addressee_id != user.id:
        raise HTTPException(status_code=403, detail="Only the guest who received the request can answer it")
    if conn.status != "pending":
        raise HTTPException(status_code=409, detail=f"This request is already {conn.status}")
    conn.status, conn.responded_at = new_status, utc_now()
    await db.commit()
    return conn


@router.post("/connections/{connection_id}/accept", response_model=ConnectionOut)
async def accept_connection(
    connection_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn = await _respond(db, connection_id, user, "accepted")
    background_tasks.add_task(
        send_push_to_user, conn.requester_id, "Travel buddy request accepted",
        f"{first_name(user.full_name)} accepted. You can now see each other's contact details.", "/dashboard?tab=buddies",
    )
    return ConnectionOut(id=conn.id, status=conn.status, created_at=conn.created_at)


@router.post("/connections/{connection_id}/decline", response_model=ConnectionOut)
async def decline_connection(
    connection_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    conn = await _respond(db, connection_id, user, "declined")
    return ConnectionOut(id=conn.id, status=conn.status, created_at=conn.created_at)


@router.post("/connections/{connection_id}/block", response_model=ConnectionOut)
async def block_connection(
    connection_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Either side can block at any time, which also ends contact access."""
    conn = await _party_connection(db, connection_id, user)
    conn.status, conn.responded_at = "blocked", utc_now()
    await db.commit()
    return ConnectionOut(id=conn.id, status=conn.status, created_at=conn.created_at)


@router.delete("/connections/{connection_id}", status_code=204)
async def remove_connection(
    connection_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Withdraw a request or disconnect: contact access ends for both sides."""
    conn = await _party_connection(db, connection_id, user)
    if conn.status in ("declined", "blocked"):
        # The row is what keeps the pair hidden and stops repeat requests; removing it would undo the block.
        raise HTTPException(status_code=409, detail="A declined or blocked request cannot be removed")
    await db.delete(conn)
    await db.commit()
