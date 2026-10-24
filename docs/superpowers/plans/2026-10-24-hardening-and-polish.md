# Hardening and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the deferred minors from the Local Experiences review, show host and operator KYC rejections in the profile banner, and re-run the whole regression suite that was skipped after the review fix pass.

**Architecture:** Small, independent fixes on `feature/local-experiences`. Each fix gets a failing test first. No schema changes, no new endpoints.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, pytest; Next.js 16, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-local-experiences-design.md` (experiences); the profile banner follows the host KYC work in `docs/superpowers/plans/2026-10-20-client-answers.md`.

## Global Constraints

- Branch `feature/local-experiences`, push to remote `concept` only. Never `origin`, never `main`/`staging`.
- No emojis anywhere. Icons are lucide-react.
- Money is integer INR. No schema change in this plan.
- Run one heavy process at a time (backend suite batches are sequential).
- Tests: `<scratchpad>\pt.sh <paths relative to backend/>`. Baseline failures (6, pre-existing): `test_admin_calendar` blocking_flow, `test_admin_uploads` rejects_unsupported_type, `test_auth` login_invalid_credentials, `test_bookings` overlapping, `test_group_reviews` x2.
- Playwright: dev server on port 3100 with `NEXT_PUBLIC_E2E_SKIP_AUTH=1`, `PLAYWRIGHT_BASE_URL=http://localhost:3100`.

## Review Focus

- Two operators actions racing (delete slot vs a booking insert) must never give a 500: expect 409.
- A guest probing another guest's booking id must learn nothing: 404 on every experience booking route.
- A guest hammering "Book" must not create unbounded Razorpay orders: the 6th unexpired pending booking is refused.
- A rejected host or operator must see why on every page, not only on the profile page.
- A paid guest whose confirm call fails on the network must not be told they were not charged.

---

### Task 1: Slot delete races a booking insert

**Files:**
- Modify: `backend/app/routers/operator.py` (`delete_slot`)
- Test: `backend/tests/test_experience_hardening.py` (create)

**Interfaces:**
- Produces: `DELETE /operator/experiences/{id}/slots/{slot_id}` answers 409 "This slot has bookings and cannot be deleted" also when the delete itself hits the `experience_bookings.slot_id` foreign key.

- [ ] **Step 1: Write `test_delete_slot_hitting_the_booking_fk_is_409`.** Create an operator, an approved experience and a slot (helpers in `tests/experience_helpers.py`, `_setup` in `test_experience_bookings.py`). Monkeypatch the `has_bookings` lookup so it reports no bookings (patch `AsyncSession.scalar` for that one query, or insert the booking row after the check by wrapping `_load_slot`), insert an `ExperienceBooking` for the slot, then call the DELETE. Assert status 409, not 500, and that the slot still exists.
- [ ] **Step 2: Run it, expect FAIL** with a 500 / IntegrityError. `pt.sh tests/test_experience_hardening.py`
- [ ] **Step 3: In `delete_slot`, wrap `await db.delete(slot); await db.commit()` in `try/except IntegrityError`, `await db.rollback()`, raise the same 409.**
- [ ] **Step 4: Run it, expect PASS.**
- [ ] **Step 5: Commit** `fix(experiences): slot delete that races a booking answers 409`.

### Task 2: Another guest's booking is a 404 everywhere

**Files:**
- Modify: `backend/app/routers/experience_bookings.py` (`verify`, review route)
- Modify: `backend/tests/test_experience_bookings.py` (existing 403 expectations)
- Test: `backend/tests/test_experience_hardening.py`

**Interfaces:**
- Produces: `POST /experience-bookings/{id}/verify` and `POST /experience-bookings/{id}/review` answer 404 "Booking not found" when the booking exists but belongs to another guest, matching `GET /experience-bookings/{id}`. A guest reviewing their own unfinished booking keeps its current 403/409 behaviour.

- [ ] **Step 1: Write `test_other_guests_booking_is_404_on_verify_and_review`.** Guest A creates a booking; guest B calls verify and review on it. Assert both 404 and an identical body to a random uuid.
- [ ] **Step 2: Run, expect FAIL** (403 on verify and review).
- [ ] **Step 3: Replace the `guest_id != user.id` 403s with the 404 used by the GET route.** Update any existing test that asserted 403 for this case to 404.
- [ ] **Step 4: Run `tests/test_experience_hardening.py tests/test_experience_bookings.py tests/test_experience_reviews.py`, expect PASS.**
- [ ] **Step 5: Commit** `fix(experiences): other guests' bookings are 404 on verify and review`.

### Task 3: Cap pending experience bookings per guest

**Files:**
- Modify: `backend/app/services/experience_booking.py` (`create_experience_booking`, new constant `MAX_PENDING_PER_GUEST = 5`)
- Test: `backend/tests/test_experience_hardening.py`

**Interfaces:**
- Produces: `create_experience_booking` raises `HTTPException(429, "Too many unpaid bookings. Finish or wait for them to expire.")` when the guest already has `MAX_PENDING_PER_GUEST` pending bookings younger than `PENDING_TTL`. Expired and paid bookings do not count.

- [ ] **Step 1: Write `test_sixth_pending_booking_is_refused_and_paid_ones_do_not_count`.** Create 5 pending bookings for one guest via `POST /experience-bookings` (each creates a fake Razorpay order via the `orders` fixture), assert the 6th is 429 and no 6th booking row exists; pay one of them, assert a new booking is accepted again. Also assert a stale pending booking (created_at older than `PENDING_TTL`) is not counted.
- [ ] **Step 2: Run, expect FAIL** (6th returns 200).
- [ ] **Step 3: Count the guest's pending, unexpired bookings before creating the order; refuse at the cap.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `fix(experiences): cap unpaid bookings per guest`.

### Task 4: Rejected KYC shows in the banner

**Files:**
- Modify: `backend/app/schemas/host_profile.py` (`CompletenessOut` gains `rejection_reason: str | None`), `backend/app/routers/host_profile.py` (`profile_completeness`)
- Modify: `frontend/lib/marketplace.ts` (`ProfileCompleteness` type), `frontend/components/host/ProfileIncompleteBanner.tsx`
- Test: `backend/tests/test_host_profile.py`, `frontend/tests/marketplace.spec.ts`

**Interfaces:**
- Produces: `GET /{host|operator}/profile/completeness` returns `rejection_reason` (null unless `kyc_status == "rejected"`). The banner shows when the profile is incomplete OR `kyc_status == "rejected"`; for a rejection it reads "Your KYC was rejected: <reason>. Please fix it and resubmit." with the same Complete profile link.

- [ ] **Step 1: Write backend test `test_completeness_reports_rejection_reason`** (admin rejects a complete host profile with a reason; `GET /host/profile/completeness` returns `complete: true`, `kyc_status: "rejected"`, the reason) and Playwright test `banner shows the rejection reason when KYC is rejected` (mock completeness `{complete: true, missing: [], kyc_status: 'rejected', rejection_reason: 'PAN image is unreadable'}`; expect the reason inside `role=status` on `/host`, and no banner for `complete: true, kyc_status: 'submitted'`).
- [ ] **Step 2: Run both, expect FAIL.**
- [ ] **Step 3: Implement the field and the banner variant.** The banner stays hidden on the profile page.
- [ ] **Step 4: Run `tests/test_host_profile.py` and the Playwright spec, expect PASS.** Run `npx tsc --noEmit` and eslint on touched files.
- [ ] **Step 5: Commit** `feat(host): profile banner shows a KYC rejection and its reason`.

### Task 5: Honest message when confirming a paid booking fails on the network

**Files:**
- Modify: `frontend/app/(main)/experiences/[id]/page.tsx` (`pay`)
- Test: `frontend/tests/experiences.spec.ts`

**Interfaces:**
- Produces: once Razorpay's `handler` has fired, a failed verify call that never reached the server (network error) shows "Payment received. We are confirming your booking, check My experiences in a minute." instead of the error or the "not been charged" text. A verify answered by the server (e.g. 409 slot full) keeps showing the server's message. `ondismiss` after the handler fired is ignored.

- [ ] **Step 1: Write Playwright `network failure while confirming a paid booking says payment was received`.** Stub `window.Razorpay` as the existing checkout spec does, fire its `handler` with a fake response, make `**/experience-bookings/*/verify` abort. Expect the payment-received text and no "not been charged".
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Track `paymentTaken` in `pay`; in the handler's catch, map a `TypeError` (fetch failure) to the new message.**
- [ ] **Step 4: Run `experiences.spec.ts`, expect PASS; tsc and eslint clean.**
- [ ] **Step 5: Commit** `fix(experiences): paid guest is not told they were not charged on a network error`.

### Task 6: Spec footer and ledger of what stays

**Files:**
- Modify: `docs/superpowers/specs/2026-10-22-local-experiences-design.md`

- [ ] **Step 1:** Remove the moot `unattributed_stays` footer line from the traveller report section (every stay booking has a guest login).
- [ ] **Step 2: Commit** `docs(experiences): drop the moot unattributed_stays line`.

### Task 7: Full regression after the review fix pass

**Files:** none.

- [ ] **Step 1:** Run the nine sequential backend batches listed in the scratchpad `batches3.log` header (one `pt.sh` run at a time, `TAILN=12`). Expect only the 6 baseline failures.
- [ ] **Step 2:** Start the 3100 dev server and run the full Playwright suite. Expect all pass except the known `admin-navigation` hydration flake, which must pass when re-run alone.
- [ ] **Step 3:** `npx tsc --noEmit` and `npm run build`, expect exit 0.
- [ ] **Step 4:** Push to `concept`, rebuild the staging stack (`docker compose -f docker-compose.staging.yml up --build -d`), smoke-check `/experiences`, `/host`, `/operator`.

## Considered and left alone (decisions, not tasks)

- Admin cancel without refund leaves the host payout owed: an admin may cancel a no-show and the host should keep the money. Needs the client's rule.
- Webhook undercounting a second distinct partial refund, admin edit overwritten by legacy `pending_changes`, connections/disputes N+1 queries, completion-sweep throttle: none loses money or data at launch volume.
- A paid booking without a Razorpay payment id cannot be guest-cancelled: cannot occur through the current flows.
