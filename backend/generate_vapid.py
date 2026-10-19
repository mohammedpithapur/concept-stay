"""
Run this script ONCE on EC2 to generate VAPID keys for Web Push:
  python generate_vapid.py

Then copy the output into backend/.env
"""
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
import base64

key = ec.generate_private_key(ec.SECP256R1(), default_backend())

# Private key: raw 32-byte scalar, base64url-encoded (no padding)
private_num = key.private_numbers().private_value
private_b64 = base64.urlsafe_b64encode(
    private_num.to_bytes(32, "big")
).decode().rstrip("=")

# Public key: uncompressed point (65 bytes), base64url-encoded
public_b64 = base64.urlsafe_b64encode(
    key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
).decode().rstrip("=")

print("Add these to your backend/.env:\n")
print(f"VAPID_PUBLIC_KEY={public_b64}")
print(f"VAPID_PRIVATE_KEY={private_b64}")
print(f"VAPID_CONTACT_EMAIL=noreply@conceptstay.in")
print()
print("And add this to your frontend .env.local or Vercel env vars:")
print(f"NEXT_PUBLIC_VAPID_PUBLIC_KEY={public_b64}")
