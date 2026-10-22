# Staging (marketplace review branch)

This branch (`staging`) runs as an isolated stack: its own Postgres, Redis, API and site. It never touches the live database or the live API.

## Run it (one command)

```bash
docker compose -f docker-compose.staging.yml up --build
```

- Site: http://localhost:3000
- API: http://localhost:8000 (docs at `/docs`)
- First start builds the schema, then loads demo data (5 verified listings with photos and map pins, and 2 experiences with three open dates each).

Demo logins (password `Staging#2026`, override with `STAGING_SEED_PASSWORD`):

| Role | Email |
|---|---|
| Admin | admin@staging.test |
| Host (approved) | host@staging.test |
| Operator (approved, KYC verified) | operator@staging.test |
| Guest | guest@staging.test |

Reset everything: `docker compose -f docker-compose.staging.yml down -v`.

New settings for this release (all optional for local staging; see `backend/app/config.py`):

| Variable | Purpose |
|---|---|
| `FIELD_ENCRYPTION_KEY` | Fernet key that encrypts host PAN and bank account numbers. Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Required when `ENVIRONMENT=production` (the API refuses to start without it); other environments derive a key from `JWT_SECRET`. Losing the key makes stored PAN and account numbers unreadable. |
| `SUPABASE_PRIVATE_BUCKET` | Name of the **private** Supabase bucket for KYC documents and guest IDs (default `private-docs`). Create it with public access OFF; files are only ever served through 5-minute signed URLs. Without Supabase configured, document uploads return 502. |
| `SUPPORTED_CURRENCIES` | Currencies guests can pay in (default INR, USD, EUR, GBP, AED, SGD, AUD). |
| `EXPERIENCE_COMMISSION_PERCENT` | Default commission on experience bookings (15). The admin can change it in the Commission tab; each booking keeps the rate it was made at. |

International payments need **Razorpay International Payments** enabled on the Razorpay account; until then non-INR orders are rejected by the gateway (INR is unaffected).

Payments need Razorpay **test** keys (`rzp_test_...`): export `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` before `up`. Without them, browsing, host and admin flows work but checkout does not. Email (Resend) and image uploads (Supabase) are not configured in this stack.

## Review script for the client

1. Guest: browse `/properties`, use filters, category strip, the map toggle and the ₹50,000+ price cap.
2. Register a new user, use "Become a host". Log in as admin, open Hosts, approve them.
3. As that host: create a listing (Host dashboard > Listings). As admin: Listing Review > approve, then set verification to verified.
4. As a guest: book it, pay with a Razorpay test card. The price shows tax on the whole total as its own line. Cancel within 10 days of booking for a full refund; after 10 days there is no refund.
5. Admin: Payouts tab, mark the host payout paid (the demo host is already KYC-verified; a new host is blocked until the admin verifies their profile in the Host KYC tab). Host: Payouts page shows it.
6. Host profile: as a new host, every host page shows "Your profile is not completed yet." until the Profile page has legal name, PAN, bank details, a PAN document and an Aadhaar or passport document. Admin: Host KYC tab > Review > Verify.
7. Guest ID: as a guest with a paid booking, add an ID from the dashboard. As the host: Bookings > View ID > Approve, or "Report to admin" with a reason. Admin: Disputes tab > Refund (always the full amount, even after 10 days) or Dismiss.
8. Travel buddies: turn it on under Travel buddies (off by default). Two opted-in guests with stays at the same property within 2 days of each other see each other's first name; contact details appear only after the request is accepted.
9. International payments: pick USD (or another currency) in the navbar. The booking page shows "Charged in USD: ..." and Razorpay is opened in that currency. Admin can change the demo rate with `PUT /admin/fx-rates/{currency}`.
10. Live listing edits: a host edit to an approved listing is published immediately (no re-approval). Finished stays turn "completed" on their own and can then be reviewed.
11. Experiences: browse `/experiences` (no stay needed), pick an open date and book. Register a new user, use "Become an operator" (a host account cannot also be an operator), approve them under Admin > Operators, then add an experience and a slot (dates are entered in India time). Admin > Experience Review > approve. A guest pays with a Razorpay test card and gets a voucher with the meeting point and the operator's contact; the operator sees the guest's first name, phone and voucher code under Bookings.
12. Experience money: the guest pays price + 5% service fee + 12% tax; the platform keeps 15% of the price (setting under Admin > Commission) plus the fee. Admin > Experience Payouts: a payout is blocked until the operator's profile is verified in the Host KYC tab. There is no guest cancellation; Admin > Experience Payouts > "Refund a booking" gives a full refund, returns the seats and voids an unpaid payout.
13. Last seat: if two guests pay for the same last seat, the second payment is refunded automatically and the guest is told. Unpaid bookings expire after 30 minutes and booking closes one hour before a slot starts.
14. Revenue per traveller: Admin > Traveller Report shows commission plus service fee from stays and experiences for each guest, with date filters.

## Hosting it on a public URL (needs your accounts)

The live frontend defaults to the production API when `NEXT_PUBLIC_API_BASE` is not set, so **always set it** for any staging deploy.

1. Backend: deploy `backend/` with its own Postgres. Environment: `ENVIRONMENT=staging`, `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_BASE_URL=<staging site URL>`, `CORS_ORIGINS=["<staging site URL>"]`, `COOKIE_SECURE=true`, Razorpay **test** keys. Start command: `python scripts/bootstrap_db.py && uvicorn app.main:app --host 0.0.0.0 --port $PORT`. For demo data run `python scripts/seed_staging.py` once (refuses to run with `ENVIRONMENT=production`).
2. Frontend: deploy the `staging` branch (for example as a Vercel preview) with `NEXT_PUBLIC_API_BASE=<staging API URL>`.
3. In the Razorpay dashboard, point a test-mode webhook at `<staging API>/payments/webhook`.

When the existing production database is later upgraded, `scripts/bootstrap_db.py` runs `alembic upgrade head` (nine new migrations); take a backup first.

## Removing the dummy listings

The existing listings are demo data. `backend/scripts/purge_listings.py` deletes every listing and experience and everything attached to them (bookings, payments, payouts, reviews, photos, slots, iCal links, price overrides, groups) and keeps users. It is a **dry run by default**:

```bash
cd backend
python scripts/purge_listings.py                       # prints what would be deleted
python scripts/purge_listings.py --yes                 # deletes
python scripts/purge_listings.py --yes --confirm-production   # required when ENVIRONMENT=production
```

Back up the database first, and run it only when you mean it: it cannot be undone.
