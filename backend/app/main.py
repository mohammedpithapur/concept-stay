import asyncio
from contextlib import asynccontextmanager
import json
import logging
import time

import sentry_sdk
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from app.config import settings
from app.database import get_db, _IS_LAMBDA
from app.rate_limit import limiter
from app.routers import admin, auth, bookings, ical, payments, properties, reviews, users, events, push, contact, articles, host, payouts
from app.models import push_subscription, price_override, payout  # noqa: F401 — ensures table is created


logger = logging.getLogger("conceptstay.api")
logging.basicConfig(level=logging.INFO)

if settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, traces_sample_rate=0.1)


from fastapi.middleware.gzip import GZipMiddleware


async def ical_background_worker():
    """Periodic worker: automatically syncs all import iCal links every 30 minutes (1800s)."""
    # Brief initial wait after server boot
    await asyncio.sleep(20)
    while True:
        try:
            from app.services.ical import sync_all_active_ical_links
            logger.info("Starting scheduled 30-minute background iCal synchronization...")
            count = await sync_all_active_ical_links()
            logger.info("Scheduled iCal sync completed: %d events processed", count)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.exception("Error in background iCal sync loop: %s", e)

        try:
            await asyncio.sleep(1800)  # 30 minutes
        except asyncio.CancelledError:
            break


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Launch background iCal periodic sync if running on a persistent server
    task = None
    if not _IS_LAMBDA:
        task = asyncio.create_task(ical_background_worker())
    yield
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Concept Stay API", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=500)
app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    lambda request, exc: JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded"},
    ),
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    origin = request.headers.get("origin", "*")
    headers = {
        "Access-Control-Allow-Credentials": "true",
    }
    if origin and origin != "*":
        headers["Access-Control-Allow-Origin"] = origin
    else:
        headers["Access-Control-Allow-Origin"] = "*"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )


app.add_middleware(SlowAPIMiddleware)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    request_id = request.headers.get("x-request-id", "")
    logger.info(
        json.dumps(
            {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            }
        )
    )
    if request_id:
        response.headers["x-request-id"] = request_id
    return response


# Exact, explicit whitelist of allowed origins (no wildcard regex)
ALLOWED_ORIGINS = [
    "https://conceptstay-delta.vercel.app",
    "https://conceptstay.vercel.app",
    "https://conceptstay.in",
    "https://www.conceptstay.in",
    "https://api.conceptstay.in",
    "https://conceptstay.com",
    "https://www.conceptstay.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
for origin in settings.CORS_ORIGINS:
    if origin not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(origin)

cors_kwargs = {
    "allow_origins": ALLOWED_ORIGINS,
    "allow_credentials": True,
    "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
}

app.add_middleware(CORSMiddleware, **cors_kwargs)

app.include_router(auth.router)
app.include_router(properties.router)
app.include_router(bookings.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(ical.router)
app.include_router(reviews.router)
app.include_router(payments.router)
app.include_router(events.router)
app.include_router(push.router)
app.include_router(contact.router)
app.include_router(articles.router)
app.include_router(host.router)
app.include_router(payouts.router)


@app.get("/")
async def root():
    return {"message": "Concept Stay API is running"}


@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "error"})
    return {"status": "ok"}


# ── AWS Lambda handler ────────────────────────────────────────────────────────
# Mangum wraps the FastAPI ASGI app so AWS Lambda + API Gateway can invoke it.
# When running locally with uvicorn this is simply ignored.
try:
    from mangum import Mangum
    handler = Mangum(app, lifespan="off")
except ImportError:
    pass  # mangum not installed in local dev — that's fine
