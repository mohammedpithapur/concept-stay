# Client Answers (Compliance, Refunds, Join-in, International Payments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the client's answers to the Phase 1 marketplace: tax on the full total, one 10-day refund rule, direct edits to live listings, host KYC profile, automatic stay completion, guest ID with host approval and admin-decided refunds, join-in connections between guests at the same stay, and Razorpay international payments.

**Architecture:** Extend the existing FastAPI/SQLAlchemy backend and Next.js frontend. Sensitive documents (host KYC, guest IDs) go to a private storage bucket behind signed URLs, never the public property-image bucket. Prices stay stored in INR; a per-booking currency and locked exchange rate drive the Razorpay order and refunds. Refunds share one service used by guest cancel and admin dispute decisions.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, Postgres, pytest; Next.js 16 / React 19 (inline-style convention, `frontend/lib/marketplace.ts` wrappers), Razorpay (incl. International), Supabase Storage (private bucket), `cryptography` (Fernet).

**Spec:** `docs/superpowers/specs/2026-10-20-client-answers-spec.md`

## Global Constraints

- Work on branch **`feature/client-answers`** (off `staging`), pushed to remote `concept`. **Never push to `concept/main` or `origin`** until the user approves.
- No emojis anywhere; use `lucide-react` icons (project rule).
- Money is integer INR rupees in the database. Tax base (exact): `base_price + extra_guest_charge + pet_charge + cleaning_fee + service_fee`. `TAX_PERCENT=12`, `GUEST_SERVICE_FEE_PERCENT=5` (of stay value), `PLATFORM_COMMISSION_PERCENT=15` (of stay value; stay value = nightly rates + extra-guest charge).
- Refund rule (exact): full refund iff `now_utc <= booking.created_at + 10 days` and the stay has not started; otherwise 0. Constant `REFUND_WINDOW_DAYS = 10`. Admin-approved dispute refunds are always full.
- Every schema change ships with an Alembic migration (chain head today: `20261020_04_review_categories`; verify with `alembic heads`).
- PII rules: never store a full Aadhaar number (only the last 4 digits if the host supplies them); PAN and bank account number are encrypted at rest (Fernet) and masked in every host-facing response; ID and KYC files live in a private bucket and are served only via signed URLs that expire in 300 seconds.
- Join-in privacy: guests are invisible by default (`open_to_connections=False`); contact details appear only after the other guest accepts; no API response before acceptance may contain `email` or `phone` of another guest.
- All "today" and "stay is over" logic uses India time (`Asia/Kolkata`) via `today_ist()`.
- Test command (from `backend/`): `python -m pytest -p no:cacheprovider -o addopts="" -q`. Env: `TEST_DATABASE_URL`, `DATABASE_URL` (Postgres on port 5433 in the dev box), `JWT_SECRET`, `JWT_REFRESH_SECRET`.
- Known baseline: 6 pre-existing backend failures (test_admin_calendar blocking_flow, test_admin_uploads rejects_unsupported_type, test_auth login_invalid_credentials, test_bookings overlapping, test_group_reviews x2). Do not count them as regressions.

## Review Focus

- Refund boundary: cancel at exactly 10 days after booking refunds; one second later does not; booking made fewer than 10 days before check-in still cannot refund after check-in. (Task 1)
- A host reading another host's guest ID, or an unauthenticated/guest caller reading any ID or KYC document, gets 403 and never a URL. (Tasks 5, 7)
- Before acceptance, no endpoint (co-guest list, requests, connections) leaks the other guest's email or phone; a non-opted-in guest never appears; a guest from a different property or non-overlapping dates cannot be requested. (Task 9)
- Admin decides one dispute twice, or a booking is both guest-cancelled and dispute-refunded: exactly one Razorpay refund is issued. (Task 7)
- USD (or other) booking: charged amount, full refund and partial-refund webhook all round-trip in minor units without drifting from the captured amount; INR bookings are byte-identical to before. (Task 11)
- Marking a payout paid for a host whose KYC is not verified is refused. (Task 5)

---

### Task 0: Branch and docs

- [ ] **Step 1:** Branch `feature/client-answers` already exists off `staging`. Commit the spec and this plan: `git add docs && git commit -m "docs: client answers spec and implementation plan"`.
- [ ] **Step 2:** `git push concept feature/client-answers` (test branch only).

### Task 1: Tax on the full total and the single 10-day refund rule

**Files:** Modify `backend/app/services/booking.py`, `backend/app/services/cancellation.py`, `backend/app/routers/bookings.py`, `backend/app/routers/payments.py` (admin refund path only if it reads policy), `frontend/lib/marketplace.ts`, `frontend/components/booking/BookingActions.tsx`, `frontend/components/host/ListingForm.tsx`, `frontend/app/(main)/properties/[id]/page.tsx`, `frontend/app/(main)/booking/[id]/page.tsx`, `frontend/app/(main)/cancellation/page.tsx`, `frontend/app/(main)/faq/page.tsx`, `frontend/app/(main)/terms/page.tsx`; Test `backend/tests/test_payouts.py`, `backend/tests/test_cancellation.py`.

**Interfaces:**
- Produces: `calculate_pricing(...)` returns `subtotal` (pre-tax total of all charges incl. service fee), `taxes = percent_of(subtotal, TAX_PERCENT)`, `total = subtotal + taxes`; other keys unchanged.
- Produces: `REFUND_WINDOW_DAYS = 10`; `compute_refund(total_paid: int, booked_at: datetime, now: datetime, check_in: date) -> int`; `refund_deadline(booked_at: datetime) -> datetime`.
- `GET /bookings/{id}/refund-preview` returns `{can_cancel, refund_amount, total_paid, refund_deadline}` (the `policy` key is removed).
- `Property.cancellation_policy` column stays (no data migration) but is no longer read or shown.

- [ ] **Step 1: Update tests first.** In `test_payouts.py` change expected numbers: 3 nights at 5000, cleaning 800, no extras: `subtotal == 16550`, `taxes == 1986`, `total == 18536`; payout `(gross, commission, fees, taxes, host_amount) == (18536, 2250, 750, 1986, 13550)`. In the extra-guest/pet test: `taxes == round(12% of (stay_value + 400 + 800 + service_fee))` (= 1656) and `total == 15456`. Rewrite `test_cancellation.py`: replace the policy-parametrised `compute_refund` test with `test_refund_boundary` asserting `compute_refund(1000, T, T + timedelta(days=10), future) == 1000`, `T + 10d + 1s -> 0`, `check_in <= now -> 0`; endpoint tests: cancel within window refunds in full and voids payout; cancel after window (set `booking.created_at` back 11 days via `db_session`) cancels with 0 refund and leaves payout owed; preview matches cancel; gateway failure keeps booking confirmed; double cancel 409.
- [ ] **Step 2: Run to see failures.** `pytest tests/test_payouts.py tests/test_cancellation.py` -> FAIL (old numbers/signature).
- [ ] **Step 3:** Implement the interfaces above; `bookings.py` cancel and preview use `booking.created_at` and `utc_now()`; delete `POLICY_TIERS`.
- [ ] **Step 4:** Frontend: replace `CANCELLATION_POLICIES` usage with `REFUND_COPY` in `lib/marketplace.ts` (`"Full refund if you cancel within 10 days of booking. After that, no refund."`); remove the policy radio from `ListingForm`; `BookingActions` shows the deadline from the preview; update static pages' wording; keep tax as its own price line.
- [ ] **Step 5: Verify.** `pytest tests/test_payouts.py tests/test_cancellation.py` -> PASS; `cd frontend && npx tsc --noEmit` -> no output.
- [ ] **Step 6: Commit** `feat: tax on full total and single 10-day refund rule`.

### Task 2: Live listing edits apply immediately

**Files:** Modify `backend/app/routers/host.py` (`edit_my_property`), `backend/app/services/listing_review.py`, `frontend/components/host/ListingForm.tsx`, `frontend/app/host/properties/page.tsx`, `frontend/tests/marketplace.spec.ts`; Test `backend/tests/test_host_listings.py`.

**Interfaces:** `PATCH /host/properties/{id}` on an `approved` listing writes fields (and images) straight to the row and returns it with `pending_changes=None`; `is_published` and `is_featured` stay forbidden. Non-live listings keep the resubmit-in-place behaviour. `approve_listing` still applies any legacy `pending_changes` if present.

- [ ] **Step 1:** Replace `test_edit_goes_to_pending_changes_until_approved` with `test_live_edit_applies_immediately` (patch name and price; public GET shows new values at once; review queue stays empty). Remove `test_reject_edit_on_live_listing_keeps_it_live`. Keep `test_host_cannot_publish_or_feature_via_patch`.
- [ ] **Step 2:** Run `pytest tests/test_host_listings.py -k "live_edit"` -> FAIL.
- [ ] **Step 3:** Implement; update form copy to "Changes to live listings are published immediately"; drop the "Edits awaiting review" chip for new data (legacy rows may still show it).
- [ ] **Step 4:** `pytest tests/test_host_listings.py tests/test_search_filters.py` -> PASS; adjust the Playwright admin-queue test to a new-listing card.
- [ ] **Step 5: Commit** `feat(host): live listing edits publish immediately`.

### Task 3: Automatic stay completion and India-time dates

**Files:** Create `backend/app/services/timeutil.py`; Modify `backend/app/services/booking.py`, `backend/app/routers/bookings.py`, `backend/app/routers/host.py`, `backend/app/routers/reviews.py`, `backend/app/main.py`; Test `backend/tests/test_auto_complete.py`.

**Interfaces:**
- Produces: `today_ist() -> date`; `complete_finished_bookings(db: AsyncSession) -> int` (marks `confirmed` + `paid` bookings, non-block, with `check_out <= today_ist()` as `completed`; throttled to once per 60 s like `auto_cleanup_expired_bookings`).
- Called from `GET /bookings/mine`, `GET /host/bookings`, `GET /host/dashboard`, the review endpoint, and an hourly task in the app lifespan (non-Lambda only). Review eligibility becomes `status == completed` only.

- [ ] **Step 1:** Tests: `test_finished_paid_booking_becomes_completed` (check_out yesterday -> after `GET /bookings/mine` status is `completed`); `test_unpaid_or_future_not_completed`; `test_cancelled_never_completed`; `test_review_allowed_without_admin_step`.
- [ ] **Step 2:** Run -> FAIL.
- [ ] **Step 3:** Implement; replace `date.today()` in cancellation/review/preview code with `today_ist()`.
- [ ] **Step 4:** Run `pytest tests/test_auto_complete.py tests/test_verified_reviews.py tests/test_cancellation.py` -> PASS.
- [ ] **Step 5: Commit** `feat: auto-complete finished stays; India-time dates`.

### Task 4: Purge dummy listings (admin-run script)

**Files:** Create `backend/scripts/purge_listings.py`; Test `backend/tests/test_purge_listings.py`.

**Interfaces:** `async def purge_all_listings(db: AsyncSession, *, dry_run: bool = True) -> dict[str, int]` returns counts per table (`properties`, `bookings`, `payments`, `payouts`, `reviews`, `images`, `ical_links`, `price_overrides`, `groups`); deletes in FK-safe order and best-effort deletes storage files via `delete_property_image_from_url`. CLI: dry run by default, `--yes` to delete, refuses `ENVIRONMENT=production` unless `--confirm-production`.

- [ ] **Step 1:** Tests: dry run returns counts and deletes nothing; real run leaves zero properties/bookings/reviews/payouts and keeps users; script refuses production without the extra flag.
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Implement. **Step 4:** Run -> PASS.
- [ ] **Step 5: Commit** `feat(scripts): purge_listings with dry-run default`. (Running it against any real database is the user's decision; do not run it from the plan.)

### Task 5: Host profile (KYC) backend and payout gate

**Files:** Create `backend/app/services/crypto.py`, `backend/app/services/private_storage.py`, `backend/app/models/host_profile.py`, `backend/app/schemas/host_profile.py`, `backend/app/routers/host_profile.py`, migration `20261021_01_host_profile.py`; Modify `backend/app/config.py` (`FIELD_ENCRYPTION_KEY`, `SUPABASE_PRIVATE_BUCKET="private-docs"`), `backend/app/main.py`, `backend/app/routers/payouts.py`, `backend/app/dependencies.py`; Test `backend/tests/test_host_profile.py`.

**Interfaces:**
- `encrypt_text(plain: str) -> str`, `decrypt_text(token: str) -> str`, `mask_tail(value: str, keep: int = 4) -> str`. Without `FIELD_ENCRYPTION_KEY`, non-production derives a key from `JWT_SECRET`; production raises at startup.
- `async upload_private(prefix: str, filename: str, content: bytes, mime: str) -> str` (returns storage path), `async signed_url(path: str, expires_in: int = 300) -> str`, `async delete_private(path: str) -> None`.
- Models: `HostProfile(user_id PK, legal_name, phone, pan_enc, aadhaar_last4, gst_number, bank_holder, bank_account_enc, bank_ifsc, kyc_status in {incomplete, submitted, verified, rejected}, rejection_reason, submitted_at, verified_at)`, `HostDocument(id, user_id, doc_type in {aadhaar, passport, pan, gst_certificate, bank_proof}, storage_path, filename, mime, size, uploaded_at)`.
- Dependency `get_host_any_status(user) -> User` (role host or admin, any `host_status`, so pending hosts can fill the profile).
- Host routes: `GET /host/profile`, `PUT /host/profile` (body `HostProfileIn`: `legal_name, phone, pan_number, aadhaar_last4?, gst_number?, bank_holder, bank_account_number, bank_ifsc`), `POST /host/profile/documents` (multipart `doc_type`, `file`; jpeg/png/webp/pdf, 8 MB), `DELETE /host/profile/documents/{id}`, `GET /host/profile/completeness` -> `{complete: bool, missing: list[str], kyc_status}`. Complete = `legal_name`, `pan_number`, bank fields, a `pan` document, and at least one of `aadhaar`/`passport` document; `gst_number` optional. Saving a complete profile sets `kyc_status="submitted"`; editing PAN/bank fields of a verified profile resets it to `submitted`.
- Admin routes: `GET /admin/kyc?status=`, `GET /admin/kyc/{user_id}` (full decrypted PAN/account for the admin plus documents with fresh signed URLs), `POST /admin/kyc/{user_id}/verify`, `POST /admin/kyc/{user_id}/reject` (body `{reason}`).
- `POST /admin/payouts/{id}/mark-paid` returns 409 `"Host KYC is not verified"` unless the payout's host has `kyc_status == "verified"` or the host is an admin account. `PayoutOut` gains `host_kyc_status`.

- [ ] **Step 1: Write failing tests** (monkeypatch `app.services.private_storage` functions with in-memory fakes): `test_pending_host_can_save_profile`; `test_pan_and_account_never_returned_in_clear_to_host` (response shows `****1234` style masks, DB columns hold ciphertext != plaintext); `test_completeness_lists_missing_items`; `test_upload_rejects_wrong_type_and_oversize`; `test_other_users_cannot_read_documents` (guest and other host -> 403); `test_admin_sees_signed_urls_and_full_values`; `test_verify_and_reject_flow`; `test_mark_paid_requires_verified_kyc`; `test_aadhaar_full_number_is_rejected` (a 12-digit `aadhaar_last4` value -> 422).
- [ ] **Step 2:** Run `pytest tests/test_host_profile.py` -> FAIL (module missing).
- [ ] **Step 3:** Implement models, services, routers, migration.
- [ ] **Step 4:** Run `pytest tests/test_host_profile.py tests/test_payouts.py` -> PASS (update payout tests whose hosts need `kyc_status="verified"` via a small helper).
- [ ] **Step 5: Commit** `feat(host): KYC profile with private documents and payout gate`.

### Task 6: Host profile frontend and "profile not completed" pop-up

**Files:** Create `frontend/app/host/profile/page.tsx`, `frontend/components/host/ProfileIncompleteModal.tsx`; Modify `frontend/components/host/HostShell.tsx` (Profile tab, modal), `frontend/lib/marketplace.ts`, `frontend/app/admin/MarketplaceTabs.tsx` (`KycTab`), `frontend/app/admin/page.tsx` (tab `kyc`); Test `frontend/tests/marketplace.spec.ts`.

**Interfaces:** `getHostProfile`, `saveHostProfile`, `uploadHostDocument(docType, file)`, `deleteHostDocument`, `getProfileCompleteness`, `listKyc`, `getKyc`, `verifyKyc`, `rejectKyc` wrappers over the Task 5 routes. `ProfileIncompleteModal` mounts in `HostShell` on every host page except `/host/profile`, calls `getProfileCompleteness` on each mount, and shows "Your profile is not completed yet." with a link to `/host/profile` and a dismiss button (dismissal lasts until the next page load).

- [ ] **Step 1:** Playwright tests (mocked API): `modal shows when profile incomplete` and `modal hidden when complete`; `profile page shows masked PAN and lists documents`.
- [ ] **Step 2:** Run `npx playwright test tests/marketplace.spec.ts` -> FAIL. **Step 3:** Implement. **Step 4:** Run -> PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(frontend): host profile page, incomplete-profile pop-up, admin KYC tab`.

### Task 7: Guest ID, host approval and admin-decided refunds (backend)

**Files:** Create `backend/app/models/guest_id.py`, `backend/app/routers/guest_ids.py`, migration `20261021_02_guest_ids_disputes.py`; Modify `backend/app/services/cancellation.py` (extract `cancel_and_refund`), `backend/app/routers/bookings.py`, `backend/app/schemas/booking.py`, `backend/app/services/email.py` (`send_admin_dispute_email`, `send_dispute_decision_email`), `backend/app/main.py`; Test `backend/tests/test_guest_ids.py`.

**Interfaces:**
- Models: `GuestIdDocument(id, booking_id UNIQUE, guest_id, doc_type in {aadhaar, passport, driving_licence, voter_id}, storage_path, filename, mime, status in {pending, approved, rejected}, rejection_reason, uploaded_at, reviewed_at, deleted_at)`; `RefundDispute(id, booking_id, opened_by, reason, status in {open, refunded, dismissed}, admin_note, decided_by, decided_at, created_at)` with a unique partial index on `booking_id` where `status = 'open'`. `Booking.guest_id_status` string column (`missing|pending|approved|rejected`, default `missing`) exposed in `BookingOut`.
- `async def cancel_and_refund(db, booking, refund_amount: int, *, reason: str) -> Booking` in `services/cancellation.py`: issues the Razorpay refund (via `issue_refund`), updates payment/booking/payout exactly as guest cancel does, and is a no-op returning the booking if it is already cancelled/refunded. Guest cancel (Task 1) now calls it.
- Guest: `POST /bookings/{id}/guest-id` (multipart `doc_type`, `file`; owner, booking paid and not cancelled, replaceable until approved), `GET /bookings/{id}/guest-id`.
- Host: `GET /host/bookings/{id}/guest-id` (`{status, doc_type, signed_url}`; property owner or admin only), `POST /host/bookings/{id}/guest-id/approve`, `POST /host/bookings/{id}/guest-id/reject` (body `{reason}`: sets status `rejected`, opens a `RefundDispute`, emails `settings.ADMIN_EMAIL`, pushes admins; 409 if a dispute is already open).
- Admin: `GET /admin/disputes?status=`, `POST /admin/disputes/{id}/decide` (body `{decision: "refund" | "dismiss", note}`): `refund` -> `cancel_and_refund(booking, booking.total, ...)` regardless of the 10-day window, then emails the guest; 409 if not `open`.
- Worker: `purge_expired_guest_ids(db)` deletes stored files 30 days after `check_out` (skips bookings with an open dispute); run hourly with `complete_finished_bookings`.

- [ ] **Step 1: Write failing tests** (fake private storage and fake Razorpay): `test_guest_uploads_id_for_own_paid_booking`; `test_other_guest_cannot_upload_or_view`; `test_host_of_property_views_signed_url_other_host_403`; `test_host_approve_sets_booking_status`; `test_host_reject_opens_dispute_and_emails_admin`; `test_admin_refund_decision_refunds_in_full_after_window` (booking 20 days old) with exactly one fake-gateway call; `test_deciding_twice_is_409_and_single_refund`; `test_guest_cancel_then_dispute_refund_issues_single_refund`; `test_dismiss_leaves_booking_untouched`; `test_purge_skips_open_dispute`.
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Implement. **Step 4:** Run `pytest tests/test_guest_ids.py tests/test_cancellation.py` -> PASS.
- [ ] **Step 5: Commit** `feat: guest ID collection, host approval and admin refund disputes`.

### Task 8: Guest ID, host bookings and disputes (frontend)

**Files:** Create `frontend/components/booking/GuestIdUpload.tsx`, `frontend/app/host/bookings/page.tsx`; Modify `frontend/components/booking/BookingActions.tsx`, `frontend/app/(main)/booking/[id]/confirmation/page.tsx`, `frontend/components/host/HostShell.tsx` (Bookings tab), `frontend/app/admin/MarketplaceTabs.tsx` (`DisputesTab`), `frontend/app/admin/page.tsx` (tab `disputes`), `frontend/lib/marketplace.ts`; Test `frontend/tests/marketplace.spec.ts`.

**Interfaces:** `uploadGuestId`, `getGuestId`, `getHostGuestId`, `approveGuestId`, `rejectGuestId`, `listDisputes`, `decideDispute`. `GuestIdUpload` shows status chips (`missing`, `pending`, `approved`, `rejected`) and an upload control; the host bookings page lists bookings with guest ID status, a "View ID" action (opens the signed URL), Approve, and "Report to admin" with a reason box.

- [ ] **Step 1:** Playwright (mocked API): host sees a booking with `pending` ID and the report action; admin Disputes tab shows an open dispute with Refund and Dismiss buttons.
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Implement. **Step 4:** Run -> PASS; `tsc` clean.
- [ ] **Step 5: Commit** `feat(frontend): guest ID upload, host booking review, admin disputes`.

### Task 9: Join-in connections (backend)

**Files:** Create `backend/app/models/connection.py`, `backend/app/services/connections.py`, `backend/app/routers/connections.py`, migration `20261021_03_join_in.py`; Modify `backend/app/models/user.py` (`open_to_connections: bool` default False), `backend/app/schemas/user.py`, `backend/app/routers/users.py` (`PATCH /users/profile` accepts `open_to_connections`), `backend/app/services/auth.py` (user cache serializer), `backend/app/main.py`; Test `backend/tests/test_connections.py`.

**Interfaces:**
- `Connection(id, requester_id, addressee_id, property_id, booking_id, status in {pending, accepted, declined, blocked}, created_at, responded_at)` unique on `(requester_id, addressee_id)`.
- `async def co_guests(db, booking: Booking) -> list[CoGuest]` where `CoGuest = {user_id, first_name, check_in, check_out, connection_status}`: other users with a paid, non-cancelled booking at the same property whose dates overlap `booking`'s, who have `open_to_connections=True`, excluding self and anyone who blocked either side. First name only; no email or phone.
- Routes: `GET /bookings/{id}/co-guests`; `POST /connections` (body `{to_user_id, booking_id}`; 403 if not co-guest eligible, 409 if exists, allowed until `check_out + 7 days`); `GET /connections` -> `{incoming, outgoing, connected}` where only `connected` items carry `{email, phone}`; `POST /connections/{id}/accept|decline|block`; `DELETE /connections/{id}`. Push notification to the addressee on request and to the requester on accept. Rate limit requests to 10/hour per user.

- [ ] **Step 1: Write failing tests:** `test_not_visible_unless_opted_in`; `test_only_overlapping_same_property_guests_listed`; `test_request_requires_shared_stay`; `test_no_contact_details_before_accept` (assert `email`/`phone` absent from co-guest, incoming and outgoing payloads); `test_accept_reveals_contacts_to_both`; `test_decline_and_block_hide_each_other`; `test_cannot_request_after_window`; `test_withdraw_removes_contact_access`.
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Implement. **Step 4:** Run `pytest tests/test_connections.py tests/test_users.py` -> PASS.
- [ ] **Step 5: Commit** `feat: join-in connections between guests at the same stay`.

### Task 10: Join-in (frontend)

**Files:** Create `frontend/components/booking/CoGuests.tsx`, `frontend/components/profile/TravelBuddies.tsx`; Modify `frontend/app/dashboard/page.tsx` (new "Travel buddies" tab and the visibility toggle in the profile section), `frontend/components/booking/BookingActions.tsx` (mount `CoGuests`), `frontend/lib/marketplace.ts`; Test `frontend/tests/marketplace.spec.ts`.

**Interfaces:** `getCoGuests`, `sendConnectionRequest`, `listConnections`, `respondConnection`, `setOpenToConnections`. `CoGuests` lists first names with stay dates and a "Request to connect" button; `TravelBuddies` shows incoming requests (Accept/Decline/Block) and connected guests with email and phone. The toggle explains what is shared ("Other guests staying at the same place can see your first name and dates. Contact details are shared only after you accept a request.").

- [ ] **Step 1:** Playwright (mocked API): toggle off hides co-guests message; connected list shows contact; incoming request can be accepted.
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Implement. **Step 4:** Run -> PASS; `tsc` clean.
- [ ] **Step 5: Commit** `feat(frontend): travel buddies and visibility toggle`.

### Task 11: International payments (backend)

**Files:** Create `backend/app/models/fx_rate.py`, `backend/app/services/fx.py`, `backend/app/routers/fx.py`, migration `20261021_04_currency.py`; Modify `backend/app/config.py` (`SUPPORTED_CURRENCIES`), `backend/app/models/booking.py`, `backend/app/schemas/booking.py` (`BookingCreate.currency`, `BookingOut.currency, charged_minor`), `backend/app/routers/bookings.py`, `backend/app/routers/payments.py`, `backend/app/services/refunds.py`, `backend/app/routers/properties.py` (quote); Test `backend/tests/test_international.py`.

**Interfaces:**
- `SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD"]` (all two-decimal currencies). Table `fx_rates(currency PK, rate_per_inr Numeric(18, 8), updated_at, updated_by)`; `INR` is implicit rate 1.
- `async def get_rate(db, currency: str) -> Decimal` (raises `UnsupportedCurrency`), `def to_minor(inr_amount: int, rate: Decimal) -> int` (rupees -> minor units of the target currency, round half up; INR returns `inr_amount * 100`), `def to_inr(minor: int, rate: Decimal) -> int` (round half up).
- `Booking` gains `currency` (default `INR`), `fx_rate` (Numeric, default 1), `charged_minor` (Integer). Set at booking creation from `BookingCreate.currency`; repricing a pending booking re-locks the rate.
- `create-order` uses `amount = booking.charged_minor`, `currency = booking.currency`, stores them on `Payment`. Full refund = `payment.amount` exactly; partial refund = `to_minor(refund_inr, booking.fx_rate)`; refund webhook converts the gateway amount back with `to_inr(amount, booking.fx_rate)` before the existing payout rescale. Payouts stay in INR.
- Routes: `GET /fx-rates` (public: supported currencies and rates), `PUT /admin/fx-rates/{currency}` (admin, body `{rate_per_inr}`), quote endpoint accepts `currency` and adds `charged: {currency, amount_minor}`.
- Config note: Razorpay "International Payments" must be enabled on the account before non-INR orders work.

- [ ] **Step 1: Write failing tests:** `test_to_minor_and_back_round_trip`; `test_unsupported_currency_is_422`; `test_inr_booking_unchanged` (amounts identical to Task 1 numbers, `payment.amount == total * 100`); `test_usd_order_uses_locked_rate_and_currency` (fake Razorpay client records `amount` and `currency`); `test_rate_change_after_order_does_not_change_charge`; `test_full_refund_equals_captured_amount_exactly`; `test_partial_refund_webhook_converts_back_to_inr`; `test_admin_only_can_set_rates`.
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Implement. **Step 4:** Run `pytest tests/test_international.py tests/test_payouts.py tests/test_cancellation.py` -> PASS.
- [ ] **Step 5: Commit** `feat(payments): multi-currency orders and refunds via Razorpay International`.

### Task 12: International payments (frontend)

**Files:** Create `frontend/lib/currency.tsx` (provider + `useCurrency`), `frontend/components/layout/CurrencySelect.tsx`; Modify `frontend/app/layout.tsx` (provider), `frontend/components/layout/Navbar.tsx`, `frontend/app/(main)/properties/[id]/page.tsx`, `frontend/app/(main)/booking/[id]/page.tsx`, `frontend/lib/api.ts` (`createBooking` sends `currency`), `frontend/lib/marketplace.ts`; Test `frontend/tests/marketplace.spec.ts`.

**Interfaces:** `useCurrency(): { currency: string; setCurrency(c: string): void; format(inr: number): string; rates }` persisting the choice in `localStorage` (guarded with try/catch). Prices stay INR on listing cards; the property and booking pages show "Charged in USD: 224.10 (rate locked at payment)" for non-INR. The Razorpay checkout options use the order's `currency`.

- [ ] **Step 1:** Playwright (mocked `/fx-rates`): choosing USD shows the converted total on the booking page; INR shows no conversion line.
- [ ] **Step 2:** Run -> FAIL. **Step 3:** Implement. **Step 4:** Run -> PASS; `tsc` clean.
- [ ] **Step 5: Commit** `feat(frontend): currency selector and international checkout`.

### Task 13: Release to the test branch

- [ ] **Step 1:** Backend suite `python -m pytest -p no:cacheprovider -o addopts="" -q` -> only the 6 baseline failures remain; `alembic heads` shows exactly one head.
- [ ] **Step 2:** `cd frontend && npx tsc --noEmit && npm run build` -> no errors; `npx playwright test --workers=1` -> pass (the cold-start `admin-navigation` flake is known).
- [ ] **Step 3:** Update `STAGING.md` (new env vars: `FIELD_ENCRYPTION_KEY`, `SUPABASE_PRIVATE_BUCKET`, Razorpay International; new demo flows; how to run `purge_listings.py` dry-run) and `backend/scripts/seed_staging.py` (verified KYC for the demo host, one FX rate row).
- [ ] **Step 4:** Run the `code-review` skill (medium) on `git diff staging..HEAD`; fix valid findings with tests first.
- [ ] **Step 5:** `git push concept feature/client-answers`. Merge into `staging` and `main` only after the user approves.

---

## Later (not in this plan)

Local experiences, the trip builder, group join-in trips with waitlists, automatic payouts (Razorpay Route), automatic daily FX refresh, guest-ID retention rules beyond 30 days, legal review of Aadhaar handling.
