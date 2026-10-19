# Concept Stay — Project Overview

**Concept Stay** (conceptstay.in) is a direct-booking website for one operator's boutique holiday homes in India (villas, cottages, heritage stays), priced in INR. It is not a marketplace: one admin team manages all properties, and guests browse, book and pay online.

---

## 1. Users and access

| Who | Can do |
|---|---|
| **Visitor** (not logged in) | Browse properties and articles, check availability, send wedding/corporate event enquiries and contact messages |
| **Guest** (`role=guest`) | Sign up with email + one-time code or Google; book and pay via Razorpay; view bookings in `/dashboard` and download a PDF voucher; edit profile and password; enable push notifications |
| **Admin** (`role=admin`) | Everything in `/admin` (see section 4) |

Only these two roles exist (`UserRole` in `backend/app/models/user.py`). The backend enforces them with `get_current_user`, `get_optional_current_user` and `get_admin` in `backend/app/dependencies.py`. The frontend guards pages with `useRequireAuth({ requireAdmin })` in `frontend/lib/auth/useRequireAuth.ts`.

---

## 2. Tech stack and deployment

| Layer | Technology |
|---|---|
| Backend | FastAPI, async SQLAlchemy 2, PostgreSQL (asyncpg), Alembic migrations, Redis cache, SlowAPI rate limiting |
| Frontend | Next.js 16.2 (App Router), React 19, TypeScript, Leaflet maps, react-day-picker, jsPDF + html2canvas |
| Storage | Supabase Storage (property images, signed direct uploads) |
| Payments | Razorpay (orders, verify, webhook, refunds) |
| Email | Resend, with Jinja HTML templates in `backend/app/templates/` |
| Notifications | Web Push (VAPID, `pywebpush`, service worker `frontend/public/sw.js`) |
| Auth | JWT access token (in localStorage) + refresh token (httpOnly cookie), Google OAuth, email one-time codes |
| Monitoring | Sentry |

**Deployment**
- Backend: `docker-compose.yml` runs gunicorn + Redis on EC2 and runs `alembic upgrade head` on start. `backend/Dockerfile.aws` builds an AWS Lambda image (Mangum handler `app.main.handler`).
- Frontend: Vercel.
- CI: `.github/workflows/tests.yml` runs pytest against Postgres 15, plus Playwright tests.

> Note: `frontend/AGENTS.md` warns that this Next.js version has breaking changes. Read `node_modules/next/dist/docs/` before writing Next.js code.

---

## 3. Repository layout

```
conceptstay/
├── backend/
│   ├── app/
│   │   ├── main.py          # App setup, CORS whitelist, middleware, 30-min iCal sync worker
│   │   ├── config.py        # Settings (env vars)
│   │   ├── dependencies.py  # Auth dependencies
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── routers/         # API endpoints
│   │   ├── services/        # Business logic (booking, email, ical, push, upload, cache, auth)
│   │   └── templates/       # Email HTML templates
│   ├── alembic/versions/    # Migrations
│   └── tests/               # pytest
└── frontend/
    ├── app/
    │   ├── (auth)/          # login, register, forgot/reset password, Google callback
    │   ├── (main)/          # public pages: properties, booking, articles, events, corporate, wedding, about, contact, faq, terms, privacy, cancellation
    │   ├── admin/           # admin panel + property editor + calendar modal
    │   ├── dashboard/       # guest dashboard
    │   └── page.tsx         # home: Hero, FeaturedProperties, CTASection, WhyChooseUs
    ├── components/          # layout/, property/, shared/
    └── lib/                 # api.ts, auth/, types/, supabase/, push.ts, copy.ts
```

---

## 4. Features

### Properties
- Fields: description, address and coordinates, contacts (phone/email/WhatsApp/spare), check-in/out times, house rules, amenities, bathroom details, local recommendations, bedrooms/bathrooms, `base_guests` / `max_guests` (default 30), minimum nights, pets (allowed, charge, max).
- Pricing: `price_per_night`, `cleaning_fee`, `extra_guest_charge_per_night`, `pet_charge_per_night`.
- **Price overrides:** date ranges with a custom nightly price, optional discount % and label.
- Photos are grouped into albums (`album_name`), with a primary image and display order.
- Flags: `is_published`, `is_featured`.
- Denormalised rating fields: `avg_rating`, `review_count`.

### Property groups
- A group contains one **whole property** listing plus individual **room** listings.
- Booking the whole property blocks every room, and booking a room blocks the whole property. This is done with zero-price **shadow bookings** (`is_shadow_block`, `parent_booking_id`).
- **Inheritance:** rooms take description, location, contacts, times, amenities and house rules from the whole-property listing unless `override_details`, `override_amenities` or `override_house_rules` is set (`services/property.py`).

### Bookings
- Flow: a `pending` booking is created, then the guest pays, then the booking becomes `confirmed` with payment status `paid`.
- Unpaid `pending` bookings are deleted after **15 minutes** (`auto_cleanup_expired_bookings`). Admin blocks are never auto-deleted.
- Concurrency: the property (or the group) row is locked with `SELECT … FOR UPDATE` while a booking is created.
- Pricing is calculated in `services/booking.py → calculate_pricing`: nightly rates with overrides, plus extra-guest charge, cleaning fee and pet charge.
- Statuses: `pending | confirmed | completed | cancelled`. Payment statuses: `unpaid | paid | refunded`.
- Admins can block dates with a note (`is_admin_block`).
- Cancelling a booking sends an email and a push notification.

### Payments (Razorpay)
- `POST /payments/create-order` (reuses an existing order if one exists), then `POST /payments/verify` (checks the signature), with `POST /payments/webhook` as a fallback.
- On confirmation: emails to the guest and admin, push notifications to admins and the guest.
- Admin: refunds, payment list, settlements, summary.

### iCal sync
- Export: a public `.ics` feed for each property.
- Import: links to other booking sites' calendars, synced every 30 minutes by a background worker (only on persistent servers, not Lambda), with a manual sync button.

### Content and enquiries
- **Reviews:** entered by admins, with the source platform recorded (e.g. Airbnb). The property's rating is recalculated after each change.
- **Event enquiries:** wedding/corporate forms with statuses `pending | contacted | confirmed | cancelled`. Confirmation email to the guest, alert to the admin.
- **Articles:** blog with slug, tags, cover image, read time and a publish flag. Admins write them in a write/preview editor.
- **Contact form:** emails the admin (`ADMIN_EMAIL`).
- **Push notifications:** subscribe, unsubscribe, test.

### Admin panel (`/admin`)
- Tabs: **overview, analytics, bookings, properties, groups, ical, payments, events, articles**.
- Property editor sections: basic, location, photos, amenities, pricing, policies, rules.
- Calendar modal: view bookings and blocks, add or remove blocks, manage price overrides.

### Guest dashboard (`/dashboard`)
- Booking list with expandable cards, a PDF voucher (jsPDF + html2canvas), and profile and password editing.

---

## 5. API reference (summary)

| Prefix | Main endpoints | Access |
|---|---|---|
| `/auth` | send-verification-otp, verify-email-otp, register, login, refresh, logout, me, google/url, google/callback, forgot-password, reset-password | public / user |
| `/properties` | list (with filters), locations, featured, `{id}`, `{id}/availability`, `{id}/price-overrides` | public |
| `/bookings` | create, mine, `{id}`; admin/all, `PATCH admin/{id}` | user / admin |
| `/payments` | create-order, verify, webhook, `{id}/refund`, booking/`{id}`; admin/all, admin/settlements, admin/summary | user / admin |
| `/users` | dashboard, profile, password | user |
| `/admin` | dashboard, analytics, properties CRUD + duplicate, image upload (presigned) / patch / delete, groups CRUD + members, calendar, blocks, price-overrides | admin |
| `/ical` | export/`{id}` (public), links CRUD, sync | public / admin |
| `/reviews` | `properties/{id}/reviews` (public); `admin/reviews` CRUD | public / admin |
| `/events` | create (public); admin/all, `PATCH admin/{id}` | public / admin |
| `/articles` | list, `{slug_or_id}` (public); admin/all, admin CRUD | public / admin |
| `/contact` | create | public |
| `/push` | vapid-public-key, subscribe, unsubscribe, test | user |
| `/health` | DB health check | public |

---

## 6. Data model

| Table | Purpose |
|---|---|
| `users` | email, password hash, name, phone, role, is_active, is_email_verified |
| `properties` | see section 4 |
| `property_images` | image_url, is_primary, display_order, album_name |
| `property_price_overrides` | start/end date, price_per_night, discount_percent, label |
| `property_groups`, `property_group_members` | grouping, with `is_whole_property` |
| `bookings` | dates, guests, pets, nights, price breakdown, status, payment_status, shadow/admin block flags, booking_ref, guest contact details, note |
| `payments` | Razorpay order/payment/signature, amount, status |
| `reviews` | property, optional guest/booking, guest_name, platform, rating, comment |
| `event_requests` | enquiry details + status |
| `articles` | blog posts |
| `ical_links` | import/export calendar URLs, last_synced |
| `password_reset_tokens` | hashed token, expiry, used_at |
| `push_subscriptions` | endpoint, keys, user |

---

## 7. Design and code conventions

- **Brand colours** (CSS variables in `frontend/app/globals.css`):
  - beige `#b7895f` (also the navbar)
  - gold `#ead0af`
  - dark `#2b2017`
  - page background `#f7efe6`
  - card background `#fffaf4`
  - border `#d9c2a8`
  - soft background `#ead1b3`
- **Font:** Figtree (Google Fonts).
- **Radii:** cards 12px, inputs and buttons 8px.
- **Styling:** almost entirely inline `style={{}}` objects that use the CSS variables (about 2,200 occurrences). Tailwind 4 is installed but rarely used. New UI should follow the inline style.
- **API calls:** wrappers in `frontend/lib/api.ts` take a `fetcher` argument (`fetchWithAuth` from `AuthContext`), which renews the token and retries once after a 401.
- **Shared types:** `frontend/lib/types/index.ts`.
- **Marketing text:** `frontend/lib/copy.ts`.
- **Large files to edit carefully:**
  - `app/admin/page.tsx` (~3.4k lines)
  - `app/admin/properties/page.tsx` (~2.6k)
  - `app/(main)/properties/[id]/page.tsx` (~1.5k)
  - `backend/app/routers/admin.py` (~1.2k)
- **Backend layering:** routers → services → models. Schemas are Pydantic v2. Every schema change needs an Alembic migration.
- **Test mode:** `NEXT_PUBLIC_E2E_SKIP_AUTH=1` swaps in a fake admin user for Playwright.

---

## 8. Known issues and cleanup candidates

1. **Security:** a real-looking `VAPID_PRIVATE_KEY` is hardcoded as a default in `backend/app/config.py` and committed to git. Rotate it and load it only from the environment.
2. **Unused code:** `backend/app/services/sms.py` (Fast2SMS) is never called.
3. **Unused data:** `frontend/lib/data/properties.ts` (`dummyProperties`) is never imported.
4. **Extra-guest charge not stored:** it is included in `total` but has no column on `Booking`, so it can't be itemised later.
5. **Own bookings skipped:** the availability check ignores the current guest's own bookings, so one guest can hold overlapping pending bookings on different date ranges.
6. **Low test coverage:** about 36 backend tests and 2 Playwright tests.
