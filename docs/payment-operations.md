# Organizer payment support

Open /admin/payments from ticket or merch operations. Choose test/live, review flagged orders/refunds or switch to all orders. Search accepts an exact buyer email, order UUID or payment reference. Results are paged at fifty and never include ticket tokens or checkout authorization URLs.

## Install

Copy src/ and the updated next.config.ts (or merge the scanner-specific Permissions-Policy rule into your custom configuration). Add prisma/migrations/20261012150000_payment_operations/. Merge the schema additions below into your existing schema.prisma, keeping your datasource and prisma.config.ts untouched:

- Order: `operationsRevision Int @default(1)` and `refund PaymentRefund?`
- MerchOrder: `operationsRevision Int @default(1)` and `refund PaymentRefund?`
- StaffUser: `refunds PaymentRefund[]`
- Copy the complete new PaymentRefund model from the updated schema.prisma.

Then run:

```sh
npm run db:deploy
npm run db:generate
npm run typecheck
npm run build
```

Keep existing environment/encryption keys and vercel.json schedules. Add REFUNDS_ENABLED=true in local and Vercel settings only when ready to test organizer refunds, with PAYSTACK_MODE=test and the existing test secret. Redeploy source/environment changes. This flag defaults to closed; preview/status lookup and late payment acceptance still require configured Paystack credentials. No new dependency or cron job is required.

The Paystack webhook URL is unchanged. Signed refund events fetch the current refund from the provider rather than trusting the event's status/amount. Verify the test-provider flow on the hosted application after installing. Automated tests mock all provider calls; this workspace did not charge or refund any real payment.

## Accepting a late payment

A flagged, unfulfilled RESERVED or EXPIRED ticket/merch order may be accepted by an enabled organizer. Add a support reason and confirm. The server rechecks the provider reference, exact order amount, currency, email, payment mode, timestamp and unique transaction identity. It rejects existing provider refund records. Current inventory must be sufficient; accepting atomically converts/reacquires stock, marks paid, clears review and creates ticket codes/email outbox only for tickets. Stale/concurrent changes have one winner. There is no arbitrary clear-flag button, and mismatched payments cannot be accepted as paid by overriding an amount.

## Full-payment refunds

1. Find the order under All orders or Needs review / refunds.
2. Add a reason and click Preview full refund. The displayed amount comes from fresh provider verification, including the actual paid amount for a mismatched payment when identity/reference match.
3. Confirm the action and click Refund [amount]. The server verifies that amount again and locks the current order/staff. Used admission tickets and dispatched/collected merchandise cannot enter this workflow.
4. Ticket codes are voided and pending ticket email is blocked. Merchandise is held and cannot be fulfilled. Reserved stock is released once, while previously sold stock remains allocated until a processed refund.
5. The provider is queried for existing refunds before creating one. One persisted request exists per order/provider transaction. A lost response becomes UNKNOWN; no automatic second creation is attempted.
6. Check provider refund status, or wait for the signed webhook. Only an exact matching full refund (transaction ID, amount, currency, domain, refund ID) marked processed changes the order to REFUNDED and restocks previously sold units once. Terminal charge/refund replays do not reopen the order.

Pending/processing/needs-attention/failed/UNKNOWN leave the order on hold. Provider processed status does not promise immediate receipt in the buyer's bank account. Buyer account pages show refund state and amount; organizer reasons/provider identifiers remain private to operations.

If no unique matching refund is found after an uncertain request, review Paystack before doing anything further. Failed refunds, partial refunds and multiple provider refund records require provider/support review; the app does not blindly retry or automatically combine partial amounts. External manual refunds should be reconciled through this page before reopening operations. Unpaid cancellation, partial refunds, returns after fulfilment and reactivation of voided tickets remain separate work.

An email already being sent when a refund starts may still reach the buyer; its void codes cannot admit anyone. Provider calls run outside DB transactions, with the persisted hold/request protecting recovery.

## Scanner header correction

The global policy disables camera access. A later /staff/check-in-specific rule permits same-origin camera use; browser permission and HTTPS are still required. Served headers were checked in the local browser smoke test. Physical camera acceptance remains pending.

References: https://paystack.com/docs/api/refund/ and https://paystack.com/docs/payments/refunds/.
