# Hosted staging: how it runs and how to operate it

This is the test site the client reviews. It runs the `staging` branch on three services. Production (`main`) is not touched until the client approves.

| Part | Service | Address |
|---|---|---|
| Website | Vercel, project `concept-stay` (root directory `frontend`) | https://concept-stay.vercel.app |
| API | Render web service `concept-stay` (Docker, root directory `backend`, Singapore) | https://concept-stay.onrender.com |
| Database and files | Supabase project `kegmzracjdyaueiamrwj` (Tokyo) | buckets `consepts` (public photos) and `private-docs` (KYC and guest IDs, private) |
| Payments | Razorpay, **test mode** | webhook `https://concept-stay.onrender.com/payments/webhook` |

Rules for this branch: push to the `concept` remote only, never to `origin`, and merge `staging` into `main` only after the client approves.

## Deploying a change

1. Commit to `staging` and push to `concept`.
2. Render redeploys the API on its own (about 3 to 5 minutes). On start it creates or upgrades the database (`scripts/bootstrap_db.py`), optionally seeds demo data, then starts the API.
3. Vercel builds the site on its own, but a `staging` build is only a **Preview**. To put it on `concept-stay.vercel.app`, open Vercel, Deployments, the newest one, the three dots, **Promote to Production**. (Or set Settings, Environments, Production, Branch Tracking to `staging` so it happens automatically. Switch that to `main` after approval.)

## Settings (Render, Environment)

Never write values into the repository. Required:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Supabase **session pooler** string, `postgresql://postgres.<project-ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`. The user must include `.<project-ref>`. Use a password of letters and numbers only (or URL-encode it). No quotes. |
| `JWT_SECRET` | Long random string. Changing it logs everyone out. |
| `FIELD_ENCRYPTION_KEY` | Fernet key that encrypts host PAN and bank numbers. If it is lost or changed, stored PAN and bank numbers can no longer be read. |
| `ENVIRONMENT` | `staging` |
| `COOKIE_SECURE` | `true` (the site and API are on different domains over HTTPS) |
| `FRONTEND_BASE_URL` | `https://concept-stay.vercel.app` |
| `CORS_ORIGINS` | `https://concept-stay.vercel.app` (no trailing slash; a comma list or JSON list also works) |
| `API_PUBLIC_URL` | `https://concept-stay.onrender.com` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Project URL and the service-role (secret) key. Never expose the key to the browser. |
| `SUPABASE_STORAGE_BUCKET` | `consepts` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | **Test** keys (`rzp_test_...`). The secret also signs the webhook, so the webhook secret in Razorpay must be this same value. |

Optional: `SEED_STAGING` (1 loads demo data on every start, 0 stops it), `STAGING_SEED_PASSWORD` (password of the four demo logins), `MEMORY_CACHE=1` (caches public lists in the server's memory; correct only while there is one server instance), `REDIS_URL` (use a real cache instead), `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (emails), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (Google sign-in), `SENTRY_DSN`.

Vercel needs one setting: `NEXT_PUBLIC_API_BASE=https://concept-stay.onrender.com`.

## Demo data

With `SEED_STAGING=1` the API loads four logins and sample stays and experiences on every start, without creating duplicates. Logins use the password in `STAGING_SEED_PASSWORD`:

| Role | Email |
|---|---|
| Admin | admin@staging.test |
| Host (approved) | host@staging.test |
| Operator (approved, KYC verified) | operator@staging.test |
| Guest | guest@staging.test |

Demo experience dates run out: the experiences page only shows experiences with an open future date. A start with `SEED_STAGING=1` adds new dates (3, 6 and 10 days ahead) to any demo experience that has none left. Redeploy once with `SEED_STAGING=1` before a client review, then set it back to `0`. Set it to `0` whenever real people use the site, and change the demo password.

## Razorpay webhook

Razorpay dashboard in **Test Mode**, Account & Settings, Webhooks, Add New Webhook. URL `https://concept-stay.onrender.com/payments/webhook`, secret equal to `RAZORPAY_KEY_SECRET`, events `payment.captured`, `payment.failed`, `refund.created`. Payments confirm through the browser even without it; the webhook is what confirms a payment when the guest closes the tab, and what records refunds made from the Razorpay dashboard.

## Free-tier limits

- Render's free service sleeps after 15 idle minutes, and the next request waits about 50 seconds. Keep it awake with a free UptimeRobot HTTP check on `https://concept-stay.onrender.com/health` every 5 minutes.
- Supabase is in Tokyo and Render in Singapore, so each uncached database query crosses regions. Public lists are cached (stays 5 minutes, experiences 30 seconds) when `MEMORY_CACHE=1`. Moving Supabase to Singapore would cut the rest.

## Troubleshooting

| Symptom in the Render log | Cause |
|---|---|
| `password authentication failed for user "postgres"` | The `DATABASE_URL` user is missing `.<project-ref>`, or the password is wrong. |
| Crash parsing `CORS_ORIGINS` | Old build. Current builds accept plain text, a comma list or JSON. |
| `psycopg2 is not async` | Old build. The current one converts `postgresql://` itself. |
| Site shows old pages after a push | The Vercel build is still a Preview. Promote it. |
| `/experiences` is empty | Demo dates ran out. See Demo data. |
| First page load takes about a minute | Free service woke up. See Free-tier limits. |

## Secrets

If a key is pasted into chat, an email or a screenshot, rotate it: Supabase database password and service key (disable the legacy `eyJ...` keys), the Razorpay secret (then update the webhook secret too), `JWT_SECRET` and `FIELD_ENCRYPTION_KEY` (note the effects above).

## Five-minute tour for the client

1. **Guest:** open the site, browse Stays and Experiences, open a stay, use the filters and the map.
2. **Guest, pay:** log in as the guest, open Experiences, pick an open date, press Pay, and use Razorpay's test card `4111 1111 1111 1111`, any future expiry and any CVV. A voucher appears.
3. **Host:** log in as the host. The dashboard shows bookings, revenue, listings, calendar and payouts. Edit a listing and see it appear in the admin queue.
4. **Operator:** log in as the operator. Add an experience and a date; the admin approves it before it shows.
5. **Admin:** log in as the admin. Review queue, hosts and operators, KYC, payouts, disputes, commission settings and the traveller report.

The full 14-step review script is in `STAGING.md`.
