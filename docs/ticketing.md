# Concert ticket checkout

Regular: ₦20,000. VIP: ₦100,000. Tables: ₦3,000,000, ₦5,000,000 and ₦10,000,000, displayed with email enquiry links. Tables cannot enter the payment API.

## Install and run a local test

Copy src/, prisma/, scripts/ and tests/ from the updated package; retain your .env and prisma.config.ts. Run:

```sh
npx prisma migrate deploy
npx prisma generate
npm run db:seed
```

Add the following server environment variables to your existing .env (do not put secret keys in NEXT_PUBLIC variables):

```ini
TICKET_SALES_ENABLED=true
PAYSTACK_MODE=test
PAYSTACK_SECRET_KEY=sk_test_YOUR_TEST_SECRET
TICKET_TOKEN_KEY=YOUR_64_CHARACTER_HEX_KEY
TABLE_ENQUIRY_EMAIL=YOUR_BOOKING_EMAIL
```

Generate TICKET_TOKEN_KEY with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep this separate from SESSION_KEY and preserve it permanently; rotating/removing it without re-encrypting existing tickets prevents code retrieval.

For a development walkthrough only, configure 10 Regular and 5 VIP test tickets:

```sh
node --env-file=.env --import tsx scripts/setup-ticketing.ts 10 5 --open
npm run dev
```

Open /tickets, sign in, select a tier and quantity, then complete Paystack's TEST checkout. The return page verifies payment and shows private ticket codes. /tickets/orders retrieves the same codes later and supports print/save to PDF. Test orders are visibly marked as invalid for admission. No real card details or charges are needed for the automated tests; see official test payment instructions for the provider walkthrough: https://paystack.com/docs/payments/test-payments/.

Inventory defaults to zero and sales closed. The two setup arguments are capacity per tier, not an assumption about actual event attendance. Run setup without --open to close sales; it refuses capacities below sold plus reserved. Real production allocations must be confirmed before live mode. PAYSTACK_MODE=live additionally requires a live secret and PAYSTACK_LIVE_ENABLED=true. Use separate test/live databases and ticket keys; no live credentials or provider calls are included here.

## Endpoints and payment handling

- GET /api/tickets/catalog — prices, availability and table enquiry links; no buyer data.
- POST /api/tickets/checkout — authenticated same-origin checkout. Input is tierCode (regular/vip), quantity (1–10), buyerName and UUID idempotencyKey. Buyer email and subject come from verified sign-in; prices come from the database.
- GET /api/tickets/orders — last 50 orders belonging to the current identity; private ticket codes returned only for paid active tickets.
- POST /api/tickets/verify — authenticated same-origin verification with the order's payment reference.
- POST /api/paystack/webhook — raw-body HMAC SHA512 verification before parsing/processing; charge.success is checked with Paystack's verify endpoint. Configure APP_ORIGIN/api/paystack/webhook in the Paystack dashboard. Localhost cannot receive provider webhooks; the authenticated callback/check-payment route supports local testing.

Orders reserve inventory for 15 minutes. Buyer-scoped request idempotency, row locks and inventory checks prevent duplicate holds and overselling. Each buyer can hold at most three unexpired reservations; authenticated routes also use the existing shared 60-request/minute quota. Provider initialization happens once per attempt outside the database transaction. Initialization failures/timeouts are recorded and are not blindly retried; use Check payment, wait for expiry, and reconcile any ambiguous charge.

Verification checks successful status, reference, snapshotted amount/currency, provider test/live domain, verified buyer email and valid payment timestamp. It locks order then inventory; payment evidence, PAID state, reserved-to-sold inventory, one private code per ticket ordinal, an outbox event, and audit are committed atomically. Duplicate callbacks/webhooks do not issue more tickets. Codes are 256-bit random tokens; only SHA256 hashes and AES-GCM encrypted copies are persisted, bound to ticket IDs. Tickets contain no attendee PII in their codes.

## Expiry and reconciliation

Run this command at least once per minute in deployed operations, with the application's server environment:

```sh
node --env-file=.env --import tsx scripts/expire-reservations.ts
```

The command expires up to 100 orders per run; increase run frequency or drain multiple batches if backlog grows. New checkout requests also clean up one batch. A dedicated scheduler is not installed by this package. Status reads preserve order state; expired reservation links are suppressed immediately.

Late successful payments after reservations have expired/released never issue tickets automatically. They persist verified payment evidence and Order.needsReconciliation=true; mismatched successful payments are also flagged. Review these orders with trusted database tooling and reconcile/refund through Paystack; no automatic refund or staff reconciliation interface is supplied. Once flagged, an order is not automatically fulfilled on subsequent verification. Keep sold-out/payment reconciliation monitoring active before going live.

Outbox entries are TICKETS_ISSUED events carrying an order ID; Resend email delivery is implemented through a scheduled worker (see ticket-emails.md). This slice provides account retrieval and printable private codes. QR rendering and staff admission scanning are implemented (see check-in.md). Email delivery and refund automation remain follow-up work. The production gate should include native PostgreSQL concurrency tests, real Paystack TEST checkout/webhook acceptance, and browser/device QA.

Provider documentation consulted:
- https://paystack.com/docs/payments/accept-payments/
- https://paystack.com/docs/payments/verify-payments/
- https://paystack.com/docs/payments/webhooks/
