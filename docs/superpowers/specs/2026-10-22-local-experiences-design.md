# Local Experiences Marketplace - Design

Date: 2026-10-22. Status: draft, awaiting user approval.
Builds on `feature/client-answers` (host KYC, payouts ledger, multi-currency, reviews).

## Goal

Trusted local operators list experiences (activities, tours, food, wellness, local transport). Guests book a dated slot and pay. Concept Stay earns a commission. North-star metric is revenue per traveller, so an admin report shows stay plus experience commission per traveller.

## Decisions (user-confirmed)

- Experiences are booked separately from stays. No stay is required.
- Instant booking. No operator accept or reject. Payment confirms the booking.
- No guest cancellation for now. Booking is final once paid. Admin can refund by hand with the existing refund tool.
- One commission rate for all operators: 15% of the experience price, one admin-configurable setting.
- Listing fields: title, description, photos, city, state, meeting point, category, duration, difficulty, minimum age, languages, included, what to bring, price per person, slots (date, start time, capacity).

## Decisions (assistant defaults, change on request)

- Operators are a person or a company. They apply, fill a KYC profile like hosts, and admin approves them.
- New experience listings and edits to live ones need admin approval.
- Service fee 5% and tax 12% apply to the whole total, tax as its own line, as on stays.
- Operator payout = price - commission, manual, blocked until operator KYC is verified.
- Categories: adventure, food, culture, wellness, nature, local_transport, other.

## Data model (new Alembic migration after `20261021_04_currency`)

- `User.role` gains `operator`; `User.operator_status` (pending|approved|suspended).
- `Experience`: id, operator_id, title, description, images (JSONB), city, state, meeting_point, category, duration_minutes, difficulty (easy|moderate|hard), min_age, languages (JSONB), included (text), what_to_bring (text), price_per_person (int INR), approval_status (draft|pending_review|approved|rejected), pending_changes (JSONB), rejection_reason, is_published, avg_rating, review_count.
- `ExperienceSlot`: id, experience_id, starts_at (date + time, India time), capacity, seats_booked. Constraint: seats_booked <= capacity.
- `ExperienceBooking`: id, experience_id, slot_id, guest_id, party_size, price_per_person, subtotal, service_fee, taxes, total, commission, currency, fx_rate, charged_minor, payment_status, status (pending|confirmed), voucher_code, created_at.
- `ExperiencePayout`: booking_id unique, operator_id, gross, commission, fees, taxes, operator_amount, status owed|paid, reference, paid_at. Reuses payout logic where possible.
- `ExperienceReview`: booking_id unique, guest_id, experience_id, rating 1-5, text.
- Setting `EXPERIENCE_COMMISSION_PERCENT` default 15 (config, overridable by admin setting).

Operator KYC reuses `HostProfile` and `HostDocument` (same table, keyed by user id) and the same completeness check.

## Booking and money

- Quote: price_per_person x party_size = subtotal of experience; service_fee = 5% of it; taxes = 12% of (subtotal + service_fee); total = sum. Currency conversion and rate lock follow stays (`services/fx.py`).
- Create booking: lock the slot row (`SELECT ... FOR UPDATE`), reject if party_size > capacity - seats_booked, create a pending booking and a Razorpay order.
- Payment verify and webhook (idempotent, both paths): mark confirmed, add party_size to seats_booked, create payout, send voucher email. A pending booking that is never paid does not hold seats.
- If the slot filled between order and payment, the booking is marked for admin refund (rare, logged).
- Past slots cannot be booked. Booking closes at slot start.

## API

- Operator: `POST /auth/become-operator`; `GET/PUT /operator/profile` (reuse host profile routes logic); `GET/POST/PATCH /operator/experiences`; `POST /operator/experiences/{id}/images`; `POST/DELETE /operator/experiences/{id}/slots` (delete only with zero bookings); `GET /operator/bookings`; `GET /operator/payouts`.
- Public: `GET /experiences` (filters: city, state, category, date, max price, sort), `GET /experiences/{id}` (with open slots), `POST /experiences/{id}/quote`, `POST /experience-bookings`, `GET /experience-bookings/mine`, `POST /experience-bookings/{id}/review`.
- Admin: operator approval, experience review queue (approve, reject with reason), experience payouts list and mark-paid (409 if operator KYC not verified), `GET /admin/traveller-report` (per traveller: stay commission, experience commission, total; matched by user id).
- Operators cannot read or edit another operator's data (403).

## Frontend

- Navbar: "Experiences" link; "Become an operator" for guests.
- `/experiences` list with filters; `/experiences/[id]` detail with slot picker, party size, price breakdown, pay.
- `/operator` dashboard: listings with status chips, slot manager, bookings, payouts, profile and KYC.
- Admin tabs: Operators, Experience review, Experience payouts, Traveller report.
- Guest dashboard: "My experiences" with voucher and review form.
- No emojis; lucide-react icons. Inline styles and CSS variables as elsewhere.

## Testing

Backend tests written first for: ownership 403s; approval flow; slot capacity and the last-seat race; payment idempotency (verify plus webhook gives one payout and one seat deduction); price and tax maths; payout gate on KYC; review only after a paid, past booking and once per booking; traveller report totals. Frontend: Playwright smoke for operator and experience pages with mocked API. Same one-pytest-at-a-time rule on this machine.

## Non-goals

Combined cart and trip builder, group join-in trips, guest cancellation and refund rules, repeating slots, operator-side accept or reject, automatic payouts, per-operator commission rates, GST invoicing by jurisdiction.

## Open items for the client

Cancellation policy; whether commission differs by category later; operator contract and liability wording; tax treatment of experiences.
