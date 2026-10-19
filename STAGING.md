# Staging (marketplace review branch)

This branch (`staging`) runs as an isolated stack: its own Postgres, Redis, API and site. It never touches the live database or the live API.

## Run it (one command)

```bash
docker compose -f docker-compose.staging.yml up --build
```

- Site: http://localhost:3000
- API: http://localhost:8000 (docs at `/docs`)
- First start builds the schema, then loads demo data (5 verified listings with photos and map pins).

Demo logins (password `Staging#2026`, override with `STAGING_SEED_PASSWORD`):

| Role | Email |
|---|---|
| Admin | admin@staging.test |
| Host (approved) | host@staging.test |
| Guest | guest@staging.test |

Reset everything: `docker compose -f docker-compose.staging.yml down -v`.

Payments need Razorpay **test** keys (`rzp_test_...`): export `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` before `up`. Without them, browsing, host and admin flows work but checkout does not. Email (Resend) and image uploads (Supabase) are not configured in this stack.

## Review script for the client

1. Guest: browse `/properties`, use filters, category strip, the map toggle and the ₹50,000+ price cap.
2. Register a new user, use "Become a host". Log in as admin, open Hosts, approve them.
3. As that host: create a listing (Host dashboard > Listings). As admin: Listing Review > approve, then set verification to verified.
4. As a guest: book it, pay with a Razorpay test card, then cancel and check the refund matches the listing's policy.
5. Admin: Payouts tab, mark the host payout paid. Host: Payouts page shows it.

## Hosting it on a public URL (needs your accounts)

The live frontend defaults to the production API when `NEXT_PUBLIC_API_BASE` is not set, so **always set it** for any staging deploy.

1. Backend: deploy `backend/` with its own Postgres. Environment: `ENVIRONMENT=staging`, `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_BASE_URL=<staging site URL>`, `CORS_ORIGINS=["<staging site URL>"]`, `COOKIE_SECURE=true`, Razorpay **test** keys. Start command: `python scripts/bootstrap_db.py && uvicorn app.main:app --host 0.0.0.0 --port $PORT`. For demo data run `python scripts/seed_staging.py` once (refuses to run with `ENVIRONMENT=production`).
2. Frontend: deploy the `staging` branch (for example as a Vercel preview) with `NEXT_PUBLIC_API_BASE=<staging API URL>`.
3. In the Razorpay dashboard, point a test-mode webhook at `<staging API>/payments/webhook`.

When the existing production database is later upgraded, `scripts/bootstrap_db.py` runs `alembic upgrade head` (four new migrations); take a backup first.
