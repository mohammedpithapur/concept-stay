# Client answers (2026-10-20): spec for the next build

Source: the client's replies to the open questions after the Phase 1 marketplace demo, plus the owner's clarifications. Where the client was vague, the interpretation is marked **[Interpretation]** so it can be confirmed.

## Money

1. Commission (15% of stay value) and guest service fee (5% of stay value) stay as built.
2. **Tax is charged on everything**: tax base = nightly stay + extra-guest charge + pet charge + cleaning fee + service fee. Tax rate stays 12% (`TAX_PERCENT`) until the client names another. Tax is shown as its own line wherever prices are shown (booking page, confirmation, email, voucher). **[Interpretation]** "text tax" in the reply means "tax" as a separate line.
3. Host payouts stay manual (admin pays outside the platform, records a reference). Payout formula unchanged: host gets stay + extra guests + pet + cleaning minus commission.

## Refunds

4. **One refund rule for every listing: full refund if the guest cancels within 10 days of making the booking.** **[Interpretation, confirmed by owner]** The 10 days run from the booking date, not from check-in. After 10 days there is no refund. The per-listing Flexible/Moderate/Non-refundable policies are retired.
5. The only way to be refunded after the 10 days is an **admin-approved dispute** (see Guest ID below). The refund is full and goes through the Razorpay refund API.
6. A payout already paid to the host is not clawed back automatically (admin recoups manually). Unchanged.

## Hosts and listings

7. Every host needs admin approval. Every new listing needs admin approval. **A live listing's later edits do not need re-approval** (they apply immediately).
8. Suspended-host rules stay as built (hidden from search, unbookable, existing bookings untouched).
9. All existing listings are dummy data and are to be removed. **[Interpretation]** "remove them in the review section" means an admin-run cleanup, not something that lands in the review queue.
10. Hosts can create an account and add listings without documents. To receive payouts they must complete a **host profile** (separate page): government ID (Aadhaar or passport), PAN, GST number if registered, and bank details **[Interpretation: bank details added because manual payouts need a destination]**. While the profile is incomplete, every host page shows a pop-up: "Your profile is not completed yet." Payouts are only marked paid for hosts whose profile an admin has verified **[Interpretation]**.

## Stays and reviews

11. A booking becomes **completed automatically** when the stay is over (no manual step). Guests can review after that.

## Guest ID and disputes

12. Guests upload a government ID for their booking. The property's host approves it. If the host finds the guest or booking not legitimate, the host reports it to the admin by email (and in an admin queue). The admin decides. If the admin accepts the reason, the guest gets a full refund, even after the 10 days. **[Interpretation]**

## Join-in (travel buddies)

13. Local experiences and the trip builder are out of scope for now. Build only: a guest who books a stay can see which other guests are staying at the same property around the same time, can request to connect, and if the other guest accepts, each sees the other's contact details in their profile. Only then can they contact each other. **[Interpretation]** "follow" and "request" are one action: a connection request. Guests are only visible if they opt in (default off).

## International payments

14. Guests outside India can pay in their own currency. Gateway: **Razorpay International** (decided by owner). Prices stay stored in INR; the guest sees and is charged an amount in the chosen currency at a rate locked when the order is created.
