import logging
import httpx
from app.config import settings

logger = logging.getLogger("conceptstay.sms")


async def send_sms(phone: str, message: str) -> bool:
    """
    Sends an SMS via Fast2SMS Dev API (Quick SMS route 'q').
    If FAST2SMS_API_KEY is not configured and ENVIRONMENT is development,
    logs the message to console.
    """
    # Clean the phone number (remove +91 prefix or whitespace if present, keep only digits)
    cleaned_phone = "".join(filter(str.isdigit, phone))
    # If it has 12 digits (like 919876543210), trim to 10 digits
    if len(cleaned_phone) == 12 and cleaned_phone.startswith("91"):
        cleaned_phone = cleaned_phone[2:]

    if not settings.FAST2SMS_API_KEY:
        if settings.ENVIRONMENT == "development":
            logger.info("[DEV SMS] Would send to %s: %s", cleaned_phone, message)
            return True
        logger.error("FAST2SMS_API_KEY is not configured")
        return False

    url = "https://www.fast2sms.com/dev/bulkV2"
    headers = {
        "authorization": settings.FAST2SMS_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "route": "q",
        "message": message,
        "numbers": cleaned_phone
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json=payload, headers=headers)
        
        if response.is_success:
            result = response.json()
            if result.get("return"):
                logger.info("SMS sent successfully to %s", cleaned_phone)
                return True
            else:
                logger.error("Fast2SMS API returned failure: %s", result)
                return False
        
        logger.error("Fast2SMS request failed with status %s: %s", response.status_code, response.text)
        return False
    except Exception as exc:
        logger.exception("Error occurred while sending SMS via Fast2SMS: %s", exc)
        return False


async def send_booking_confirmation_sms(
    phone: str,
    booking_ref: str,
    property_name: str,
    check_in: str,
    check_out: str,
    total: str
) -> bool:
    """Sends a booking confirmation SMS containing key booking information."""
    message = (
        f"Booking Confirmed!\n"
        f"Ref: {booking_ref}\n"
        f"Property: {property_name}\n"
        f"Check-in: {check_in}\n"
        f"Check-out: {check_out}\n"
        f"Total: INR {total}\n"
        f"Thank you for choosing Concept Stay!"
    )
    return await send_sms(phone, message)


async def send_booking_cancellation_sms(
    phone: str,
    booking_ref: str,
    property_name: str,
    refund: bool = False
) -> bool:
    """Sends a booking cancellation SMS."""
    refund_msg = " A full refund has been initiated." if refund else ""
    message = (
        f"Booking Cancelled.\n"
        f"Ref: {booking_ref}\n"
        f"Property: {property_name}\n"
        f"Your booking has been cancelled.{refund_msg}\n"
        f"We hope to host you again soon."
    )
    return await send_sms(phone, message)
