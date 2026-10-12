# Automated shipping payments

New delivery checkouts collect merchandise plus delivery in one Paystack payment. Event pickup adds no shipping charge. Shipping uses organizer-managed flat fees per order for supported Nigerian states/FCT. There are no invented rates, weight calculations or carrier-account assumptions. Courier/tracking updates continue through organizer fulfilment.

## Install

Copy updated src/, tests/ and docs/. The updated existing tests are required because new delivery checkout payloads use quotes rather than the old separately charged delivery consent.

Add prisma/migrations/20261012170000_shipping_payments/. Merge the new ShippingRate model and these fields into your existing MerchOrder model, preserving your datasource/prisma.config.ts configuration:

```prisma
shippingFeeMinor Int @default(0)
shippingRateId String? @db.Uuid
shippingSnapshot Json?
shippingRate ShippingRate? @relation(fields:[shippingRateId],references:[id],onDelete:Restrict)
```

Run:

```sh
npm run db:deploy
npm run db:generate
npm run typecheck
npm test
npm run build
```

Push/deploy after the database migration. Keep your current Pro vercel.json schedules, .env, encryption keys and package files. No new dependency, secret, environment switch or scheduler is required. MERCH_SALES_ENABLED and existing Paystack settings still control sales. Start with PAYSTACK_MODE=test for acceptance.

## Configure real rates

Open /admin/merch/shipping (Delivery rates from Merch operations or Inventory). An enabled organizer adds a destination label such as FCT, a confirmed fee in naira, and buyer-visible delivery service/coverage notes. Enable the destination only when the price and coverage are confirmed. Each fee covers one order of up to ten merch units; set a fee that covers this policy. Zero is allowed only when the organizer explicitly chooses free delivery.

State labels are selected from configured destinations; the shopper does not supply arbitrary shipping prices or fee overrides. Labels are immutable after creation. Disable a destination rather than deleting it; existing order snapshots are retained. Duplicate state keys ignore case/spacing, and concurrent edits use revision checks with actor-linked audits. Rates are scoped to the configured concert.

No shipping fees are seeded. If no destinations are enabled, the storefront offers event pickup and explains that delivery is being configured. Adding rates does not itself open merch sales.

## Buyer checkout

The signed-in buyer selects delivery, enters street/city and selects a configured state/FCT. Checkout requests an encrypted ten-minute quote bound to buyer, event, payment mode, normalized cart, each product unit price and delivery rate revision. Quotes do not reserve stock. The buyer sees merchandise subtotal, delivery fee and grand total, along with the delivery note, before confirming the address/total and proceeding to Paystack.

The server locks/rechecks the enabled rate and product prices at reservation. Stale rates/prices, expired or tampered quotes, foreign buyers/carts/modes and mismatched destinations fail without consuming stock or initializing a new payment. Quote API bodies accept only cart/fulfilment/destination IDs; checkout does not accept client prices. Refreshing a quote resets delivery consent. Cart storage contains only variant IDs/quantities, never quotes or contact/address data.

Reservations last fifteen minutes. Existing idempotent retries reuse captured order pricing; regenerating the opaque quote token alone does not create another reservation/payment. The UI checks the returned order total before redirecting, and directs a buyer to My merch orders if an existing reservation has a different captured total. An existing order's checkout URL remains available there during its reservation window.

Payment verification checks the complete stored total, including shipping. A payment for only the merch subtotal is held for reconciliation and cannot be dispatched. Full pre-fulfilment refunds include the actually paid shipping amount; stock is restored once through existing refund processing. This is not a partial-refund or return-after-dispatch workflow.

## Order history and legacy delivery

New orders snapshot the rate ID, revision, destination, fee and note. Receipts show merch and shipping separately. Organizer dispatch confirmations recognize prepaid shipping.

Orders made before this update retain zero shippingFeeMinor, no shipping snapshot, their original payment total and the original separately quoted delivery terms. No fee is retroactively added, and existing payment callbacks still verify their original totals. Legacy dispatch still requires the organizer to confirm those original fee arrangements. Historical shipping data must not be overwritten when rates change.

## Acceptance

1. Add your confirmed delivery rate in the organizer screen and enable it.
2. Buy merch for event pickup: shipping should be zero.
3. Buy merch for delivery: confirm the displayed fee and grand total match Paystack, then verify the order and prepaid dispatch note.
4. Change/disable a rate before creating a reservation: refresh should be required and no stock should be consumed by the rejected stale quote.
5. Confirm an existing reservation/paid order keeps its captured rate after edits.
6. Exercise a full pre-dispatch refund in Paystack TEST and confirm the full amount and one stock restoration.

Automated tests use synthetic rates and mock Paystack. Native PostgreSQL CI, real hosted Paystack TEST acceptance, physical mobile QA and courier fulfilment acceptance remain to be completed after installation.
