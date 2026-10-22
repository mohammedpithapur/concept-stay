# Local Experiences Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operators list experiences with dated slots, guests book and pay instantly, Concept Stay takes a 15% commission, and admin sees revenue per traveller.

**Architecture:** A parallel `experience_*` stack beside stays, because `Payment.booking_id` and `Payout.booking_id` are foreign keys to stays bookings. It reuses `percent_of`, `fx`, `issue_refund`, `HostProfile` KYC and the admin approval pattern. The shared Razorpay webhook dispatches to stays or experiences by order id. `operator` is its own `UserRole`.

**Tech Stack:** FastAPI, async SQLAlchemy 2, Alembic, Postgres, pytest; Next.js 16 / React 19 (inline styles, `lib/marketplace.ts` wrappers), Razorpay, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-22-local-experiences-design.md`

## Global Constraints

- Work on branch `feature/local-experiences`. Push only to remote `concept`, never `origin`, never `main` or `staging`, until the user says the client approved.
- No emojis anywhere (UI, copy, emails, code). Use lucide-react icons.
- Money is integer INR; guest total = value + service_fee + taxes; `service_fee = percent_of(value, GUEST_SERVICE_FEE_PERCENT)` (5); `taxes = percent_of(value + service_fee, TAX_PERCENT)` (12); `commission = min(value, percent_of(value, commission_percent))` with default 15; `operator_amount = value - commission`. Worked example: 2 people at 2500 gives value 5000, fee 250, taxes 630, total 5880, commission 750, operator 4250.
- Commission percent lives in `app_settings` key `experience_commission_percent` (default from config `EXPERIENCE_COMMISSION_PERCENT=15`) and is snapshotted on each booking.
- Booking closes 1 hour before slot start; unpaid bookings expire after 30 minutes; max party size 20.
- Categories: `adventure, food, culture, wellness, nature, local_transport, other`. Difficulty: `easy, moderate, hard`. Images max 10. Voucher code: 10 random uppercase alphanumerics, unique.
- Booking statuses: `pending, confirmed, completed, failed_full, expired, refunded`. Payment statuses: `created, paid, failed, refunded`. Payout statuses: `owed, paid, voided`.
- One account has one role; a host cannot become an operator and vice versa. `userrole` gains `operator` via `ALTER TYPE ... ADD VALUE` in `autocommit_block()`.
- No guest cancellation. Admin refund is full only.
- Backend tests: one pytest process at a time. Windows dev box runs `C:\Python314\python.exe` with `PYTHONPATH` at the scratchpad venv's `Lib\site-packages`; the runner is `<scratchpad>\pt.sh <paths relative to backend/>` against Postgres container `cs-pg` port 5433. Known baseline failures (6): `test_admin_calendar` blocking_flow, `test_admin_uploads` rejects_unsupported_type, `test_auth` login_invalid_credentials, `test_bookings` overlapping, `test_group_reviews` x2.
- Frontend follows `frontend/AGENTS.md` (this Next.js version has breaking changes; read the relevant guide in `node_modules/next/dist/docs/` before using a Next API you have not used here).
- Most repo files use CRLF line endings. Keep each file's existing endings when editing.

## Review Focus

1. Two guests pay for the last seat at the same time: one is confirmed, the other is refunded in full, no payout is created for the second (Task 6).
2. Webhook then verify, verify then webhook, or the webhook twice: exactly one seat deduction and one payout (Task 6).
3. Operator lowers capacity below booked seats, or deletes a slot that has a pending booking: refused with 409 (Task 5).
4. Booking a past slot, a slot starting within 1 hour, party size 0 or above the seats left or above 20: refused with 422 or 409 (Task 6).
5. Suspended operator or unpublished listing that already has confirmed bookings: hidden from search and unbookable, existing bookings and payouts untouched (Tasks 4, 5, 6).

Each item has its test in the task named.

---

### Task 1: Operator role, dependencies, onboarding, KYC routes

**Files:**
- Modify: `backend/app/models/user.py`, `backend/app/dependencies.py`, `backend/app/schemas/user.py`, `backend/app/routers/auth.py`, `backend/app/routers/host_profile.py`, `backend/app/routers/admin.py`, `backend/app/main.py`
- Test: `backend/tests/test_operators.py`, `backend/tests/experience_helpers.py` (shared helpers, not collected)

**Interfaces:**
- Produces: `UserRole.operator`; `OperatorStatus(str, enum.Enum)` with `pending|approved|suspended`; `User.operator_status: Mapped[OperatorStatus]` (`SAEnum(OperatorStatus)`, default `approved`, same pattern as `host_status`); `UserOut.operator_status: str = "approved"`; `get_operator(user) -> User` (admin, or role operator with status approved; else 403); `get_operator_any_status(user) -> User` (role operator or admin; else 403); `POST /auth/become-operator` (guest only, else 409; sets role operator, status pending, clears the `user:{id}` cache like `become_host`); `GET /admin/operators`, `PATCH /admin/operators/{user_id}` body `{operator_status}` (mirror `/admin/hosts`); profile routes `/operator/profile`, `/operator/profile/completeness`, `/operator/profile/documents` (POST), `/operator/profile/documents/{doc_id}` (DELETE), each behaving exactly like the `/host/profile*` routes but guarded by `get_operator_any_status`.
- `tests/experience_helpers.py`: `async make_operator(client, admin_token, email) -> str` (register, become-operator, admin approves, return token; mirrors `_make_host` in `tests/test_host_listings.py`); `h(token) -> dict` (bearer header).

- [ ] **Step 1: Write failing tests in `test_operators.py`:** `test_guest_can_become_operator_pending`; `test_host_cannot_become_operator` and `test_operator_cannot_become_host` (both 409); `test_pending_operator_blocked_from_get_operator_route` (use `/operator/profile/completeness` is any-status, so assert a pending operator gets 200 there but a plain guest gets 403); `test_admin_approves_and_suspends_operator`; `test_operator_profile_roundtrip_and_completeness` (PUT legal_name, GET returns it, completeness lists missing fields); `test_operator_kyc_visible_to_admin` (`GET /admin/kyc` lists the operator after profile save).
- [ ] **Step 2: Run** `pt.sh tests/test_operators.py` and see failures (no route / no enum value).
- [ ] **Step 3: Implement** the model, enum, dependencies, schema and auth route as in Interfaces. Refactor `host_profile.py` so the host routes are produced by a function `build_profile_router(prefix: str, dependency) -> APIRouter` called twice (`/host` with `get_host_any_status`, `/operator` with `get_operator_any_status`), keeping the `/admin/kyc*` routes on the module router. Include the operator router in `main.py`. Add the two admin operator routes next to `/admin/hosts`.
- [ ] **Step 4: Run** `pt.sh tests/test_operators.py tests/test_host_profile.py tests/test_hosts.py` and see all pass (host KYC tests prove the refactor kept behaviour).
- [ ] **Step 5: Commit** `feat(experiences): operator role, onboarding and KYC routes`.

### Task 2: Experience data models and migration

**Files:**
- Create: `backend/app/models/experience.py`, `backend/app/models/app_setting.py`, `backend/alembic/versions/20261022_01_experiences.py`
- Modify: `backend/app/models/__init__.py`, `backend/app/config.py`
- Test: `backend/tests/test_experience_models.py`

**Interfaces:**
- Produces models in `experience.py` (tables in parentheses): `Experience` (`experiences`), `ExperienceSlot` (`experience_slots`), `ExperienceBooking` (`experience_bookings`), `ExperiencePayment` (`experience_payments`), `ExperiencePayout` (`experience_payouts`), `ExperienceReview` (`experience_reviews`); `AppSetting(key: str PK, value: str)` in `app_setting.py`. Columns exactly as the spec's Data model section. `ExperienceSlot` has CHECK `0 <= seats_booked AND seats_booked <= capacity` and CHECK `capacity >= 1`; `ExperienceBooking` has CHECK `party_size >= 1`; `ExperiencePayment.booking_id` and `razorpay_order_id` unique; `ExperiencePayout.booking_id` unique; `ExperienceReview.booking_id` unique, rating CHECK 1-5; indexes on `experiences(city)`, `(category)`, `(is_published, approval_status)`, `experience_slots(experience_id, starts_at)`. `starts_at` is `DateTime(timezone=True)`. Config adds `EXPERIENCE_COMMISSION_PERCENT: int = 15`.
- All six models and `AppSetting` imported in `models/__init__.py` and listed in `__all__` (so a fresh DB bootstrap creates the tables).
- Migration `20261022_01_experiences` revises `20261021_04_currency`: `ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'operator'` inside `autocommit_block()`, creates the `operatorstatus` enum and `users.operator_status` (server default `approved`), then all new tables. Downgrade drops the tables, the column and `operatorstatus`; the enum value stays (documented in a comment).

- [ ] **Step 1: Write failing tests:** `test_slot_check_constraint_rejects_overbooking` (insert slot with seats_booked > capacity, expect IntegrityError); `test_payout_unique_per_booking`; `test_review_unique_per_booking`; `test_voucher_code_unique`.
- [ ] **Step 2: Run** `pt.sh tests/test_experience_models.py`; expect import error.
- [ ] **Step 3: Implement** models, config and `__init__` registration.
- [ ] **Step 4: Run** the new tests; expect pass.
- [ ] **Step 5: Write the migration**, then verify on a scratch database: `docker exec cs-pg psql -U postgres -c "create database mig_check"`, run `alembic upgrade head` with `DATABASE_URL` pointed at it, then `alembic downgrade -1`, then `alembic upgrade head` again, then `alembic heads` shows a single head `20261022_01_experiences`. Drop the scratch database afterwards.
- [ ] **Step 6: Commit** `feat(experiences): data model and migration`.

### Task 3: Pricing and commission setting

**Files:**
- Create: `backend/app/services/experience_pricing.py`, `backend/app/services/app_settings.py`
- Modify: `backend/app/routers/admin.py` (settings routes)
- Test: `backend/tests/test_experience_pricing.py`

**Interfaces:**
- Produces: `compute_experience_pricing(price_per_person: int, party_size: int, commission_percent: int) -> dict` returning `{value, service_fee, taxes, total, commission, operator_amount}` using `percent_of` from `services/payouts.py` and `settings.GUEST_SERVICE_FEE_PERCENT` / `settings.TAX_PERCENT`; `async get_commission_percent(db) -> int` (reads `app_settings` key `experience_commission_percent`, falls back to `settings.EXPERIENCE_COMMISSION_PERCENT`); `async set_commission_percent(db, percent: int) -> None` (0-100, upsert, does not commit); routes `GET /admin/settings/experience-commission` -> `{percent}` and `PUT /admin/settings/experience-commission` body `{percent: int 0..100}` (admin only, 422 outside range).

- [ ] **Step 1: Write failing tests:** `test_worked_example` (2 x 2500 at 15 gives `value 5000, service_fee 250, taxes 630, total 5880, commission 750, operator_amount 4250`); `test_commission_never_exceeds_value` (percent 100 gives operator_amount 0, never negative); `test_default_commission_is_config` (no row gives 15); `test_admin_sets_commission_and_non_admin_forbidden` (PUT 20 then GET returns 20; guest gets 403; 101 gives 422).
- [ ] **Step 2: Run** and see failures.
- [ ] **Step 3: Implement** both services and routes.
- [ ] **Step 4: Run** `pt.sh tests/test_experience_pricing.py tests/test_payouts.py`; all pass.
- [ ] **Step 5: Commit** `feat(experiences): pricing and commission setting`.

### Task 4: Operator listings and admin review

**Files:**
- Create: `backend/app/schemas/experience.py`, `backend/app/services/experience_review.py`, `backend/app/routers/operator.py`
- Modify: `backend/app/routers/admin.py` (review queue, approve, reject, unpublish), `backend/app/main.py`
- Test: `backend/tests/test_operator_listings.py`

**Interfaces:**
- Consumes: `get_operator`, `h`, `make_operator` (Task 1); models (Task 2).
- Produces schemas `ExperienceIn` (all listing fields; validators: category and difficulty from the constants, `price_per_person > 0`, `min_age >= 0`, `languages` list of 1-40 char strings, `images` max 10), `ExperiencePatch` (all optional), `ExperienceOut`, `ExperienceAdminOut` (adds `pending_changes`, `rejection_reason`, `operator_id`).
- Produces `apply_pending_changes(db, experience) -> Experience` in `services/experience_review.py`.
- Routes (operator, `Depends(get_operator)`, scoped to `operator_id == user.id`, others 403): `GET /operator/experiences`; `POST /operator/experiences` (creates `pending_review`, `is_published=False`); `PATCH /operator/experiences/{id}` (on a `pending_review` or `rejected` listing edit fields directly; on `approved` write the diff to `pending_changes` and set `pending_review` while live data is unchanged); `POST /operator/experiences/{id}/unpublish`; `POST /operator/upload-image` (delegate to the same helper `host.py` uses via `admin_router.upload_image_file`).
- Admin routes: `GET /admin/experience-review-queue`, `POST /admin/experiences/{id}/approve` (applies `pending_changes`, sets `approved`, `is_published=True`), `POST /admin/experiences/{id}/reject` body `{reason}`, `POST /admin/experiences/{id}/unpublish`.

- [ ] **Step 1: Write failing tests:** `test_create_is_pending_and_hidden`; `test_operator_cannot_touch_other_operators_listing` (403 on PATCH and unpublish); `test_edit_approved_goes_to_pending_changes_live_unchanged` (public data keeps old price until approve); `test_approve_applies_changes_and_publishes`; `test_reject_stores_reason`; `test_pending_operator_cannot_create` (403); `test_invalid_category_and_price_rejected` (422); `test_unpublish_hides_listing` (also keeps existing confirmed bookings: assert via a booking row inserted directly, still `confirmed`).
- [ ] **Step 2: Run** and see failures.
- [ ] **Step 3: Implement** schemas, service, operator router and admin routes. Follow `routers/host.py` and `services/listing_review.py` for the approval pattern.
- [ ] **Step 4: Run** `pt.sh tests/test_operator_listings.py tests/test_host_listings.py`; pass.
- [ ] **Step 5: Commit** `feat(experiences): operator listings with admin approval`.

### Task 5: Slots and public search

**Files:**
- Create: `backend/app/routers/experiences.py`
- Modify: `backend/app/routers/operator.py` (slot routes), `backend/app/main.py`
- Test: `backend/tests/test_experience_slots.py`, `backend/tests/test_experience_search.py`

**Interfaces:**
- Produces operator slot routes: `POST /operator/experiences/{id}/slots` body `{starts_at: datetime with timezone, capacity: int >= 1}` (slot must be in the future; allowed on any listing state the operator owns without re-approval); `PATCH /operator/experiences/{id}/slots/{slot_id}` body `{capacity}` (409 if below `seats_booked`); `DELETE /operator/experiences/{id}/slots/{slot_id}` (409 if any booking on the slot is `confirmed`, `completed` or `pending`).
- Produces public routes in `experiences.py`: `GET /experiences` query `city, state, category, date, max_price, sort (newest|price_asc|price_desc), limit, offset` returning only experiences with `approval_status=approved`, `is_published`, operator `approved`, and at least one future bookable slot (starts more than 1 hour from now and seats left); `GET /experiences/{id}` returning the listing plus `slots: [{id, starts_at, capacity, seats_left}]` for bookable slots only (404 if not publicly visible); `POST /experiences/{id}/quote` body `{slot_id, party_size, currency?}` returning pricing from Task 3 plus `charged` in the requested currency via `get_rate` and `to_minor`, and 422 for unsupported currency (same shape as the stays quote in `routers/properties.py`).
- `seats_left = capacity - seats_booked`. Constant `BOOKING_CUTOFF = timedelta(hours=1)` in `services/experience_booking.py` (create that module here with the constant and `slot_is_bookable(slot, now) -> bool`).

- [ ] **Step 1: Write failing tests:** `test_add_slot_in_past_rejected` (422); `test_capacity_cannot_drop_below_booked` and `test_delete_slot_with_pending_booking_409` (insert booking rows directly); `test_delete_empty_slot_ok`; `test_other_operator_cannot_add_slot` (403); search tests: `test_search_only_shows_approved_published_with_future_slot`, `test_slot_within_one_hour_not_listed`, `test_suspended_operator_listings_hidden`, `test_filters_city_category_date_max_price`, `test_detail_lists_seats_left`, `test_quote_matches_worked_example_and_currency`, `test_unsupported_currency_422`.
- [ ] **Step 2: Run** and see failures.
- [ ] **Step 3: Implement** routes and `slot_is_bookable`. Compare slot times in UTC against `utc_now()` made timezone-aware; the helper is the single place the cut-off is computed.
- [ ] **Step 4: Run** both test files; pass.
- [ ] **Step 5: Commit** `feat(experiences): slots, public search and quote`.

### Task 6: Booking, payment, confirmation and webhook dispatch

**Files:**
- Create: `backend/app/routers/experience_bookings.py`, `backend/app/services/experience_payments.py`
- Modify: `backend/app/services/experience_booking.py`, `backend/app/routers/payments.py` (webhook dispatch only), `backend/app/services/email.py` (voucher email), `backend/app/main.py`
- Test: `backend/tests/test_experience_bookings.py`

**Interfaces:**
- Consumes: pricing (Task 3), `slot_is_bookable` (Task 5), `_get_razorpay_client` and `_verify_signature` from `routers/payments.py`, `issue_refund` from `services/refunds.py`, `get_rate`/`to_minor` from `services/fx.py`.
- Produces `async create_experience_booking(db, user, slot_id, party_size, currency) -> tuple[ExperienceBooking, ExperiencePayment]` in `services/experience_booking.py`: guest must be logged in; validates slot bookable (422 past or inside cut-off), `1 <= party_size <= 20`, `party_size <= capacity - seats_booked` (409), experience publicly visible; snapshots `commission_percent`, price, fx rate, `charged_minor`; creates the Razorpay order (receipt = voucher code); persists booking `pending` and payment `created`; random unique `voucher_code`. Does not hold seats.
- Produces `class SlotFull(Exception)` and `async confirm_experience_payment(db, payment: ExperiencePayment, razorpay_payment_id: str, signature: str | None = None) -> ExperienceBooking` in `services/experience_payments.py`. Behaviour: if payment already `paid` return its booking unchanged; else in one transaction lock the slot `FOR UPDATE`, re-check seats; enough seats: add `party_size` to `seats_booked`, payment `paid`, booking `confirmed`, insert `ExperiencePayout` with `ON CONFLICT DO NOTHING` on `booking_id` (gross = total, commission, fees = service_fee, taxes, operator_amount), commit; not enough: payment `refunded`, booking `failed_full`, refund the full `payment.amount` via `asyncio.to_thread(issue_refund, razorpay_payment_id, payment.amount)` (if the gateway fails, leave payment `paid` and booking `failed_full` for admin), no payout, commit, raise `SlotFull`.
- Produces `async handle_experience_webhook_event(db, event_type: str, payload: dict) -> bool` in the same module; returns True when it recognised the order id as an experience order. `payment.captured` calls `confirm_experience_payment` (swallowing `SlotFull`), `payment.failed` marks a `created` payment `failed` and the booking `expired`, `refund.created` marks payment and booking `refunded` only if not already (no second seat release).
- Routes: `POST /experience-bookings` body `{slot_id, party_size, currency?}` returns `{booking, razorpay_order_id, amount, currency, key_id}` (503 when gateway keys missing); `POST /experience-bookings/{id}/verify` body `{razorpay_order_id, razorpay_payment_id, razorpay_signature}`: owner only (403 otherwise), bad signature 400, `SlotFull` becomes 409 "Slot is full, your payment was refunded"; `GET /experience-bookings/mine`; `GET /experience-bookings/{id}` (owner only, other users 404; includes meeting point and operator contact only when `confirmed` or `completed`).
- Webhook: in `razorpay_webhook`, before the existing handling, call `handle_experience_webhook_event`; if it returns True return `{"status": "ok"}` early. Stays behaviour must be unchanged.
- Voucher email: `send_experience_voucher_email(to_email, guest_name, title, starts_at, party_size, meeting_point, voucher_code, operator_contact)` sent as a background task after confirmation (by verify and webhook; failures are logged, never raised).

- [ ] **Step 1: Write failing tests** (import `orders` from `tests.test_international` and `fake_razorpay` from `tests.test_cancellation`; read them first to see what they record): `test_booking_requires_login`; `test_cannot_book_past_or_within_cutoff_slot`; `test_party_size_bounds` (0, 21, above seats left); `test_create_snapshots_commission_and_price` (change the commission setting afterwards, booking and payout keep 15); `test_verify_confirms_takes_seats_and_creates_payout` (payout `commission 750, operator_amount 4250`); `test_verify_then_webhook_one_payout_one_seat_deduction` and `test_webhook_twice_idempotent`; `test_last_seat_race_second_payer_refunded_in_full` (two bookings of 1 seat each on a capacity 1 slot, both orders created, first verify wins, second verify returns 409, second booking `failed_full`, payment `refunded`, refund recorded for `payment.amount`, exactly one `ExperiencePayout`); `test_bad_signature_400`; `test_other_user_cannot_verify_or_read` (403/404); `test_voucher_hidden_until_confirmed`; `test_stays_webhook_still_works` (existing `tests/test_payouts.py` webhook test still passes); `test_international_currency_charged_minor` (USD rate locked on booking).
- [ ] **Step 2: Run** and see failures.
- [ ] **Step 3: Implement** services and routes as in Interfaces.
- [ ] **Step 4: Run** `pt.sh tests/test_experience_bookings.py tests/test_payouts.py tests/test_international.py tests/test_cancellation.py`; all pass (stays regression included).
- [ ] **Step 5: Commit** `feat(experiences): booking, payment confirmation and webhook dispatch`.

### Task 7: Expiry and completion sweeps

**Files:**
- Modify: `backend/app/services/experience_booking.py`, `backend/app/main.py` (housekeeping worker)
- Test: `backend/tests/test_experience_sweeps.py`

**Interfaces:**
- Produces `async expire_stale_experience_bookings(db, now=None) -> int` (booking `pending` older than 30 minutes and payment `created` becomes `expired`, payment `failed`; paid ones untouched) and `async complete_finished_experience_bookings(db, now=None) -> int` (booking `confirmed` whose slot `starts_at + duration_minutes` has passed becomes `completed`). Both commit and return the count. `housekeeping_worker` calls both each hour and logs counts.

- [ ] **Step 1: Write failing tests:** `test_stale_pending_expires_but_fresh_does_not`; `test_paid_booking_never_expires`; `test_finished_confirmed_becomes_completed_and_future_stays_confirmed`.
- [ ] **Step 2: Run**, see failures. **Step 3: Implement.** **Step 4: Run** and see pass.
- [ ] **Step 5: Commit** `feat(experiences): expiry and completion sweeps`.

### Task 8: Admin refund, payouts, operator bookings

**Files:**
- Create: `backend/app/routers/experience_payouts.py`, `backend/app/schemas/experience_payout.py`
- Modify: `backend/app/routers/operator.py`, `backend/app/main.py`
- Test: `backend/tests/test_experience_payouts.py`

**Interfaces:**
- Consumes: `_kyc_by_host` from `routers/payouts.py` (works for any user id), `issue_refund`.
- Produces: `GET /admin/experience-payouts?status=owed|paid|voided` (each row includes `operator_kyc_status`); `POST /admin/experience-payouts/{id}/mark-paid` body `{reference}` (409 if not `owed`, 409 "Operator KYC is not verified" unless verified or admin-owned); `GET /operator/payouts`; `GET /operator/bookings` (only `confirmed` or `completed` bookings; returns guest first name, party size, guest phone, voucher code, slot start, experience title; no email, no last name); `POST /admin/experience-bookings/{id}/refund`: only `confirmed` or `completed`, 409 otherwise and idempotent on `refunded`; full refund via `issue_refund` (503 or 502 if gateway fails and nothing changes), booking `refunded`, payment `refunded`, payout `voided` when `owed` (a `paid` payout is left as is and the response flags `payout_needs_recovery: true`), seats returned to the slot (`seats_booked -= party_size`, never below 0) in one transaction.

- [ ] **Step 1: Write failing tests:** `test_mark_paid_blocked_until_kyc_verified`; `test_mark_paid_after_verify_records_reference`; `test_operator_sees_only_own_payouts_and_bookings` (403 on other data, none leaked); `test_operator_booking_list_shows_first_name_and_phone_only`; `test_admin_refund_releases_seats_voids_payout`; `test_refund_twice_idempotent_no_double_release`; `test_refund_paid_payout_flags_recovery`; `test_non_admin_cannot_refund` (403).
- [ ] **Step 2: Run**, see failures. **Step 3: Implement.** **Step 4: Run** `pt.sh tests/test_experience_payouts.py tests/test_payouts.py`; pass.
- [ ] **Step 5: Commit** `feat(experiences): payouts, admin refund and operator booking list`.

### Task 9: Reviews

**Files:**
- Modify: `backend/app/routers/experience_bookings.py`, `backend/app/routers/experiences.py`
- Create: `backend/app/schemas/experience_review.py`
- Test: `backend/tests/test_experience_reviews.py`

**Interfaces:**
- Produces `POST /experience-bookings/{id}/review` body `{rating: int 1..5, text: str (max 2000)}`: only the booking's guest (403 otherwise), booking status `confirmed` or `completed` and slot `starts_at` already passed (else 409), one per booking (409 on repeat); recomputes `avg_rating` (mean rounded to one decimal) and `review_count` on the experience in the same transaction. `GET /experiences/{id}/reviews` public list, newest first, guest first name only.

- [ ] **Step 1: Write failing tests:** `test_review_before_slot_started_409`; `test_review_unpaid_or_refunded_409`; `test_non_owner_403`; `test_duplicate_409`; `test_rating_average_and_count_update` (ratings 5 and 4 give 4.5 and 2); `test_public_list_hides_last_name`.
- [ ] **Step 2: Run**, see failures. **Step 3: Implement.** **Step 4: Run**, pass.
- [ ] **Step 5: Commit** `feat(experiences): verified-guest reviews`.

### Task 10: Traveller report

**Files:**
- Create: `backend/app/services/traveller_report.py`
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_traveller_report.py`

**Interfaces:**
- Produces `async build_traveller_report(db, date_from: date | None, date_to: date | None, limit: int, offset: int) -> dict` returning `{items: [{user_id, full_name, email, stay_revenue, experience_revenue, total_revenue}], total, unattributed_stays}`; route `GET /admin/traveller-report?from=&to=&limit=&offset=` (admin only, limit max 200). Revenue = `commission + fees` from payouts whose status is not `voided`; stay side joins `Payout` to `Booking` on `booking_id` filtered to `Booking.guest_id IS NOT NULL`; experience side joins `ExperiencePayout` to `ExperienceBooking` with status not `refunded`. Dates filter on booking `created_at`. Users with only one kind appear (full outer join or union then group by user). Sorted by `total_revenue` descending. `unattributed_stays` counts non-voided stay payouts with no `guest_id`.

- [ ] **Step 1: Write failing tests:** `test_traveller_with_stay_and_experience_sums_both` (stay payout commission 2250 + fees 750, experience 750 + 250: total 4000); `test_stay_only_and_experience_only_travellers_appear`; `test_refunded_and_voided_count_zero`; `test_date_range_filters`; `test_pagination_and_sort_order`; `test_non_admin_403`; `test_unattributed_stays_counted`.
- [ ] **Step 2: Run**, see failures. **Step 3: Implement** (one SQL aggregation per side then merge in Python is fine). **Step 4: Run**, pass.
- [ ] **Step 5: Commit** `feat(experiences): admin traveller report`.

### Task 11: Frontend library and public pages

**Files:**
- Create: `frontend/lib/experiences.ts`, `frontend/app/(main)/experiences/page.tsx`, `frontend/app/(main)/experiences/ExperiencesClient.tsx`, `frontend/app/(main)/experiences/[id]/page.tsx`, `frontend/components/experiences/SlotPicker.tsx`, `frontend/components/experiences/ExperienceCard.tsx`, `frontend/app/dashboard/MyExperiences.tsx`
- Modify: `frontend/app/dashboard/page.tsx` (add a "My experiences" tab), `frontend/components/layout/Navbar.tsx` ("Experiences" link; "Become an operator" for guests)
- Test: `frontend/tests/experiences.spec.ts`

**Interfaces:**
- Produces in `lib/experiences.ts` (same fetcher style as `lib/marketplace.ts`): types `Experience`, `ExperienceSlot`, `ExperienceQuote`, `ExperienceBooking`, `OperatorBooking`, `ExperiencePayout`; wrappers `listExperiences(params)`, `getExperience(id)`, `quoteExperience(id, body)`, `bookExperience(body, fetcher)`, `verifyExperiencePayment(id, body, fetcher)`, `myExperienceBookings(fetcher)`, `getExperienceBooking(id, fetcher)`, `reviewExperienceBooking(id, body, fetcher)`, `applyToBeOperator(fetcher)`. Constants `EXPERIENCE_CATEGORIES` (value and label) and `DIFFICULTIES`.
- Pages: list with filters (city, category, date, max price) driven by URL query params; detail with description, included, what to bring, slot picker, party size, live quote (reuses the currency from `useCurrency`), Pay button using the Razorpay checkout flow the stays booking page already uses (copy its script-loading pattern); post-payment shows the voucher (meeting point, operator contact). Use lucide-react icons only.

- [ ] **Step 1: Write the Playwright spec** `experiences.spec.ts` with a `beforeEach` that aborts unmocked `:8000` calls (as `marketplace.spec.ts` does) and mocks `**/experiences**` and `**/experience-bookings**` (use `**` so query strings match): `list shows cards and filters by category`; `detail shows slots and updates the price when party size changes`; `sold out slot (seats_left 0) is disabled`; `voucher shows meeting point after verify`.
- [ ] **Step 2: Run** with the dev server started by hand with `NEXT_PUBLIC_E2E_SKIP_AUTH=1` on port 3000 (clear `.next` first if a plain dev server built it): `npx playwright test tests/experiences.spec.ts`; see failures.
- [ ] **Step 3: Implement** the library, components and pages.
- [ ] **Step 4: Run** the spec until it passes, then `npm run lint` and `npm run build`; both clean.
- [ ] **Step 5: Commit** `feat(frontend): experiences browse, book and voucher`.

### Task 12: Frontend operator dashboard

**Files:**
- Create: `frontend/app/operator/page.tsx`, `frontend/app/operator/apply/page.tsx`, `frontend/app/operator/experiences/page.tsx`, `frontend/app/operator/slots/page.tsx`, `frontend/app/operator/bookings/page.tsx`, `frontend/app/operator/payouts/page.tsx`, `frontend/app/operator/profile/page.tsx`
- Modify: `frontend/lib/experiences.ts` (operator wrappers), `frontend/components/layout/Navbar.tsx` ("Operator dashboard" for approved operators)
- Test: `frontend/tests/operator.spec.ts`

**Interfaces:**
- Consumes: the host pages (`app/host/*`) as the pattern, including `ProfileIncompleteModal` for the KYC prompt. Wrappers added: `listOperatorExperiences`, `createExperience`, `updateExperience`, `unpublishExperience`, `addSlot`, `updateSlot`, `deleteSlot`, `listOperatorBookings`, `listOperatorPayouts`, `getOperatorProfile`, `saveOperatorProfile`, `uploadOperatorDocument`, `deleteOperatorDocument`, `uploadExperienceImage`.
- Pages: apply (pending explanation); experiences list with status chips (Draft, Pending review, Approved, Rejected with reason) and an editor form with every listing field and photo upload; slot manager (date, time entered as India time and sent as an ISO string with `+05:30`, capacity; shows seats booked; delete disabled with a tooltip when booked); bookings table (first name, party size, phone, voucher, slot); payouts table; profile and KYC page reusing the host profile form component with the operator wrappers.

- [ ] **Step 1: Write the Playwright spec:** `non operator is redirected away`; `experience list shows status chips and rejection reason`; `slot form sends an India-time ISO string` (assert the request body `starts_at` ends with `+05:30`); `delete is disabled for a slot with bookings`; `bookings table shows no email column`.
- [ ] **Step 2: Run**, see failures. **Step 3: Implement.** **Step 4: Run** spec, `npm run lint`, `npm run build`; pass.
- [ ] **Step 5: Commit** `feat(frontend): operator dashboard`.

### Task 13: Frontend admin tabs

**Files:**
- Create: `frontend/app/admin/ExperienceTabs.tsx`
- Modify: `frontend/app/admin/page.tsx` (register tabs), `frontend/lib/experiences.ts` (admin wrappers)
- Test: `frontend/tests/experiences-admin.spec.ts`

**Interfaces:**
- Produces tabs Operators (approve, suspend; KYC link to the existing KYC detail view), Experience review (queue with approve, reject with reason, unpublish; shows `pending_changes` diff), Experience payouts (mark paid with reference; button disabled with an explanation when `operator_kyc_status` is not `verified`), Commission (read and set the percent), Traveller report (table with stay, experience and total revenue, date range inputs, pagination, footer line for unattributed stays), and a Refund button on a booking lookup if the admin pastes a booking id. Wrappers: `listOperators`, `setOperatorStatus`, `listExperienceQueue`, `approveExperience`, `rejectExperience`, `unpublishExperienceAdmin`, `listExperiencePayouts`, `markExperiencePayoutPaid`, `getCommission`, `setCommission`, `getTravellerReport`, `refundExperienceBooking`.

- [ ] **Step 1: Write the Playwright spec** (mock `**/admin/**`): `pending operator can be approved`; `review queue approve and reject need a reason`; `mark paid disabled when KYC not verified`; `commission change sends percent`; `traveller report renders rows and the unattributed footer`.
- [ ] **Step 2: Run**, see failures. **Step 3: Implement.** **Step 4: Run** all three experience specs plus `tests/marketplace.spec.ts`, then `npm run lint` and `npm run build`; pass.
- [ ] **Step 5: Commit** `feat(frontend): experiences admin tabs`.

### Task 14: Staging docs, seed and full regression

**Files:**
- Modify: `STAGING.md`, `backend/scripts/seed_staging.py`, `backend/scripts/purge_listings.py`
- Test: `backend/tests/test_purge_listings.py` (extend)

**Interfaces:**
- `seed_staging.py` additionally creates an approved operator `operator@staging.test` (password `Staging#2026`) with a verified KYC profile, two approved experiences and three future slots each. `purge_listings.py` (dry-run by default) also lists and, with `--yes`, deletes experiences, slots, experience bookings, payments, payouts and reviews (child rows first). `STAGING.md` gains the operator demo login, the new migration, the `EXPERIENCE_COMMISSION_PERCENT` setting, and a review script covering: operator applies and is approved, lists an experience, admin approves, guest books and pays with Razorpay test keys, voucher appears, operator sees the booking, admin marks payout paid after KYC, traveller report shows the revenue.

- [ ] **Step 1: Write the failing purge test:** `test_purge_removes_experience_data_only_with_yes` (dry-run leaves rows, `--yes` removes experience rows and keeps users).
- [ ] **Step 2: Run**, see failure. **Step 3: Implement** seed, purge and docs.
- [ ] **Step 4: Run the whole backend suite in sequential batches** (never two pytest processes at once; split into batches like `<scratchpad>\batches.sh`, with the new test files in their own batches). Expect only the 6 baseline failures listed under Global Constraints. Run `npx playwright test` and `npm run build` for the frontend; all pass.
- [ ] **Step 5: Commit** `docs(staging): experiences seed, purge and review script`, then `git push concept feature/local-experiences`. Do not merge anywhere. Tell the user the branch is ready for client review.
