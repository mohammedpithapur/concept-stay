# Local Experiences Marketplace - Design

Date: 2026-10-22. Status: revised after builder review, awaiting user approval.
Builds on `feature/client-answers` (host KYC, payouts ledger, multi-currency, reviews).

## Goal

Trusted local operators list experiences (activities, tours, food, wellness, local transport). Guests book a dated slot and pay. Concept Stay earns a commission. North-star metric is revenue per traveller, so an admin report shows stay plus experience revenue per traveller.

## Decisions (user-confirmed)

- Experiences are booked separately from stays. No stay is required.
- Instant booking. No operator accept or reject. Payment confirms the booking.
- No guest cancellation for now. Booking is final once paid. Admin can refund by hand (see Refunds).
- One commission rate for all operators: 15% of the experience price, one admin-configurable setting.
- Listing fields: title, description, photos, city, state, meeting point, category, duration, difficulty, minimum age, languages, included, what to bring, price per person, slots (date, start time, capacity).

## Decisions (assistant defaults, change on request)

- Operators are a person or a company. They apply, fill a KYC profile like hosts, and admin approves them.
- New experience listings and edits to live ones need admin approval.
- Categories: adventure, food, culture, wellness, nature, local_transport, other.
- A user can be a host and an operator at the same time (see Roles).
- Guests may book until 1 hour before the slot starts.

## Roles

- No change to the `userrole` Postgres enum. `User` gains `is_operator` (bool, default false) and `operator_status` (pending|approved|suspended, a plain string column with a CHECK). A host can also be an operator.
- New dependencies `get_operator` (approved) and `get_operator_any_status` (for profile and KYC pages) in `dependencies.py`. Admin passes `get_operator`.
- KYC reuses `HostProfile` and `HostDocument` (keyed by user id). The profile routes are refactored so one handler set is exposed under `/host/profile` and `/operator/profile`; both read and write the same row, so a person who is host and operator has one KYC. `/admin/kyc` already lists by user.
- `POST /auth/become-operator` sets `is_operator=true`, `operator_status=pending`.

## Money

Same formula as stays (`calculate_pricing`, `services/payouts.py`):

- `value` = price_per_person x party_size
- `service_fee` = 5% of value (platform revenue)
- `taxes` = 12% of (value + service_fee), collected for remittance, not platform revenue
- `total` = value + service_fee + taxes
- `commission` = `percent_of(value, commission_percent)`, never above value (`max(0, ...)`)
- `operator_amount` = value - commission
- Platform revenue = commission + service_fee

Worked example, 2 people at 2,500: value 5,000; service fee 250; taxes 630; total 5,880; commission 750; operator amount 4,250; platform revenue 1,000.

- Commission percent: new table `app_settings(key PK, value)` with key `experience_commission_percent`; default comes from config `EXPERIENCE_COMMISSION_PERCENT=15`. Admin `PUT /admin/settings/experience-commission`. The percent is snapshotted on each booking, so later changes never rescale old payouts.
- Currency, rate lock, `charged_minor` follow `services/fx.py`; unsupported currency returns 422 as on stays.
- Who is liable for GST on the operator's supply, and whether commission is taxable, is a client question (see Open items). The stored `taxes` field lets accounting change later.

## Data model (one Alembic migration after `20261021_04_currency`)

New models are imported in `app/models/__init__.py` so a fresh database gets the tables.

- `User`: `is_operator`, `operator_status`.
- `AppSetting`: key, value.
- `Experience`: id, operator_id, title, description, images (JSONB, max 10), city, state, meeting_point, category, duration_minutes, difficulty (easy|moderate|hard), min_age, languages (JSONB, validated list), included, what_to_bring, price_per_person (int INR, > 0), approval_status (draft|pending_review|approved|rejected), pending_changes (JSONB), rejection_reason, is_published, avg_rating, review_count. Indexes on (city), (category), (is_published, approval_status).
- `ExperienceSlot`: id, experience_id, starts_at (timestamptz, stored UTC, entered as India time), capacity (>= 1), seats_booked. CHECK 0 <= seats_booked <= capacity. Index on (experience_id, starts_at).
- `ExperienceBooking`: id, experience_id, slot_id, guest_id (required, a login is needed to book), party_size (CHECK >= 1, <= remaining seats, <= 20), price_per_person, value, service_fee, taxes, total, commission_percent, commission, currency, fx_rate, charged_minor, voucher_code (unique, random 10 chars, retry on collision), status, created_at.
- `ExperiencePayment`: id, booking_id (unique FK to experience_bookings), razorpay_order_id (unique), razorpay_payment_id, amount (minor units), currency, status (created|paid|failed|refunded). Separate from `Payment`, whose `booking_id` is a unique FK to stays bookings.
- `ExperiencePayout`: booking_id unique, operator_id, gross, commission, fees, taxes, operator_amount, status (owed|paid|voided), reference, paid_at. Created with `ON CONFLICT DO NOTHING` like `create_payout_for_booking`.
- `ExperienceReview`: booking_id unique, guest_id, experience_id, rating 1-5, text, created_at.

### Booking status

`pending` -> `confirmed` -> `completed` (after slot start plus duration, by the existing hourly housekeeping worker) ; `pending` -> `failed_full` (paid but slot full, auto-refunded) ; `pending` -> `expired` (unpaid after 30 minutes) ; `confirmed` or `completed` -> `refunded` (admin refund).

## Payments integration

Razorpay has one webhook URL. `/payments/webhook` looks the order id up in `payments` first, then in `experience_payments`, and dispatches to the matching handler. Existing stays code paths are not changed except for that lookup.

Confirm step (used by both `/experience-bookings/{id}/verify` and the webhook, idempotent):

1. Verify signature, load `ExperiencePayment`; if already `paid`, return the confirmed booking (no second payout, no second seat deduction).
2. In one transaction, lock the slot row `FOR UPDATE` and re-check `capacity - seats_booked >= party_size`.
3. Enough seats: add party_size to seats_booked, set payment `paid`, booking `confirmed`, create the payout, send the voucher email.
4. Not enough seats (slot filled between order and payment): set payment `refunded` and booking `failed_full`, issue a full refund through `issue_refund` (as `_refund_late_payment` does for stays), create no payout, and answer verify with 409 "Slot is full, your payment was refunded".

Creating the booking and order only checks capacity as a friendly early error. It does not hold seats. A `payment.failed` webhook sets the payment `failed`. A sweep in the hourly worker moves `pending` bookings older than 30 minutes to `expired`.

## Refunds (admin only)

`POST /admin/experience-bookings/{id}/refund`: full refund via `issue_refund`, booking `refunded`, payout `voided` (if already `paid`, left as is and flagged for manual recovery, same ruling as stays), seats returned to the slot. Idempotent. The `refund.created` webhook handler for experience payments only syncs state; it does not double-release seats.

## Slots and listing edits

- Slot start is compared to `now` in UTC; India time is used only for display and entry. Booking closes 1 hour before start. The review rule uses the same clock.
- Operator may add slots to an approved listing without re-approval. Slots can be deleted only when they have zero confirmed and zero pending bookings. Capacity cannot drop below `seats_booked`.
- Edits to text fields, price and photos on an approved listing go to `pending_changes` and need admin approval; the live listing shows the last approved data. A price change applies to new bookings only. Slots are unaffected by pending changes.
- Admin or operator can unpublish a listing. Unpublishing hides it from search and blocks new bookings; confirmed bookings stand. Admin can suspend an operator (hides all their listings, blocks bookings, keeps payouts owed).

## API

- Operator: `POST /auth/become-operator`; `GET/PUT /operator/profile`, documents routes (shared with host); `GET/POST/PATCH /operator/experiences`; `POST /operator/experiences/{id}/images`; `POST /operator/experiences/{id}/unpublish`; `POST/DELETE /operator/experiences/{id}/slots`; `GET /operator/bookings` (guest first name, party size, phone, voucher, only for confirmed or completed paid bookings); `GET /operator/payouts`.
- Public: `GET /experiences` (filters: city, state, category, date, max price, sort; only approved, published, operator approved, future slots), `GET /experiences/{id}` (with bookable slots and seats left), `POST /experiences/{id}/quote`.
- Guest (login required): `POST /experience-bookings`, `POST /experience-bookings/{id}/verify`, `GET /experience-bookings/mine`, `GET /experience-bookings/{id}` (voucher with meeting point and operator contact, only after confirmed), `POST /experience-bookings/{id}/review`.
- Admin: operator list and `PATCH` status; experience review queue (approve, reject with reason, unpublish); `GET /admin/experience-payouts`, `POST .../mark-paid` (409 unless operator KYC is verified); refund route above; `PUT /admin/settings/experience-commission`; `GET /admin/traveller-report`.
- Operators cannot read or edit another operator's data (403). Reading a booking you do not own returns 404.

## Reviews

One review per booking, only by the booking's guest, only when status is `confirmed` or `completed` and the slot has started. Creating a review recomputes `avg_rating` and `review_count` on the experience in the same transaction. Separate from the stays `Review` model.

## Traveller report

`GET /admin/traveller-report?from=&to=&limit=&offset=`. One row per user id with: stay commission + stay service fee from non-voided stay payouts (via `Booking.guest_id`), experience commission + service fee from non-voided experience payouts and non-refunded bookings, and totals. Full outer join across both sources, so travellers with only one type appear. Bookings without a `guest_id` (email-only stays) are excluded and counted in a footer line. Refunded or voided money counts as zero. Date range filters by booking creation. Sorted by total revenue, paginated. Revenue is platform revenue (commission plus service fee), not guest-paid totals.

## Frontend

- Navbar: "Experiences" link; "Become an operator" for guests.
- `/experiences` list with filters; `/experiences/[id]` detail with slot picker, party size, price breakdown, pay.
- `/operator` dashboard: listings with status chips, slot manager, bookings, payouts, profile and KYC.
- Admin tabs: Operators, Experience review, Experience payouts, Commission setting, Traveller report.
- Guest dashboard: "My experiences" with voucher and review form.
- No emojis; lucide-react icons. Inline styles and CSS variables as elsewhere.

## Testing

Backend tests first for: dual host and operator role; ownership 403s; approval and pending-change flow; capacity cannot drop below booked seats; last-seat race and pay-after-full (auto refund, no payout, `failed_full`); verify plus webhook gives one payout and one seat deduction; webhook dispatch finds stays and experience orders; price and tax maths against the worked example; commission snapshot survives a setting change; payout gate on KYC; admin refund releases seats and voids payout; expiry sweep; review rules and rating update; traveller report totals including one-sided travellers; migration applies on top of the current head and fresh DB bootstrap creates the tables. Frontend: Playwright smoke for operator and experience pages with mocked API (abort unmocked `:8000` calls). One pytest process at a time on this machine.

## Non-goals

Combined cart and trip builder, group join-in trips, guest cancellation and refund rules, repeating slots, operator-side accept or reject, check-in tracking, automatic payouts, per-operator commission rates, GST invoicing by jurisdiction.

## Open items for the client

Cancellation policy; whether commission differs by category later; who is liable for GST on experiences and whether commission is taxable; operator contract and liability wording; whether the 1-hour booking cut-off suits transport.
