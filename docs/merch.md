# Merchandise storefront

Three dummy tees cost ₦50,000 each, two dummy caps and one dummy satchel cost ₦30,000 each. Tees have S/M/L/XL variants; caps and satchel are One size. Designs are code-rendered placeholders. These are synthetic catalogue entries, not final product artwork or a size guide. Seed creates inactive products with zero stock and preserves existing records.

## Install

Copy updated src/, scripts/, tests/ and docs/. Add the new prisma/migrations/20261011220000_merch_store migration and merge the new merch enums/models from schema.prisma, keeping your datasource/prisma.config.ts configuration and existing .env. No package dependency changes are required. Keep your existing vercel.json cron configuration.

```sh
npm run db:deploy
npm run db:generate
npm run db:seed
```

Set MERCH_SALES_ENABLED=true in local .env and Vercel Production environment for the hosted Paystack test walkthrough. Keep PAYSTACK_MODE=test and use the existing test secret. Configure temporary stock:

```sh
node --env-file=.env --import tsx scripts/setup-merch.ts 5 --open
```

This sets total stock capacity to five **per variant**, not five per product: 15 variants, 75 units overall. This is test stock only. It refuses capacity below reserved plus sold. To close all products, run the same command without --open; stock setup is a trusted operator CLI with an audit trail. The environment switch must also be true. Replace stock and designs with confirmed values before opening real sales. Restart Next.js and deploy the source after migration/seed complete. Opening test stock in a database shared with the hosted test deployment makes it visible there too.

## Customer flow

/merch has product selection, a browser-local cart and verified sign-in. The cart persists across sign-in; contact/address fields are not stored in browser storage. /merch/orders lists only the signed-in buyer's last fifty orders, confirms Paystack returns and allows payment rechecks. Server validation limits a cart to ten units and prohibits duplicate variant lines and caller-supplied prices, owners or payment states.

Event pickup has no additional charge, at the Abuja show on 20 December 2026; collection point details are pending. Buyers provide a name and phone. Nigerian delivery additionally requires street address, city, state/FCT and explicit consent that the separately quoted delivery charge is not included in checkout. The product subtotal is charged now; organizers contact buyers to agree delivery cost and settlement before dispatch. The quote/fee payment itself is handled outside this application in this slice. It is not free delivery, and there is no shipping-rate calculator or automated delivery-fee collection.

Paystack callback: APP_ORIGIN/merch/orders. The existing signed /api/paystack/webhook handles both ticket and merch references. No new provider webhook is necessary. Google auth allows returning to /merch, /merch/orders and /admin/merch. Merch confirmations/status are available in the account page; no merch email sender is included in this slice.

## Inventory and payments

Merchandise orders/payments are separate from concert ticket orders; they never create admission tickets or affect ticket sales totals. Ordered line names, variant labels and unit prices are snapshotted. Checkout holds stock for fifteen minutes, derives NGN totals from the database and binds idempotency to the buyer/event and unchanged input. Transactions lock products and variants in consistent order, and database constraints prevent overselling.

Provider initialization is claimed once; an uncertain request cannot blindly start a second provider transaction. Successful verification checks reference, amount, currency, mode, email and timestamp. Replayed callbacks/webhooks sell stock once. Provider transaction IDs cannot be reused between ticket and merch payments. Late/mismatched successful payments require reconciliation and never fulfil automatically. There is no automatic refund or reconciliation-clear action.

Expired holds release stock once. Checkout cleans a bounded batch of five expired merch orders. For additional cleanup run:

```sh
node --env-file=.env --import tsx scripts/expire-merch.ts
```

Repeat until it returns zero. This command processes at most twenty-five expired orders per run. A protected GET /api/jobs/merch-expiry endpoint processes up to twenty-five per request within a cooperative time budget, using Authorization: Bearer CRON_SECRET. On Hobby, you may add a daily cron entry alongside the existing email entry (e.g. path /api/jobs/merch-expiry, schedule 0 7 * * *). On Pro schedule frequent cleanup. Use scripts/setup-cron.ts daily or pro to merge the managed schedules into existing configuration, then deploy. See vercel-deployment.md. Monitor reserved stock and cleanup backlog before launch.

## Organizer flow

/admin/merch requires an enabled ADMIN account, with test/live payment filtering and fifty-order cursor pagination. It exposes buyer contact/address to authorized organizers, payment references and fulfilment state, without checkout authorization URLs. Pickup: PENDING → READY → COMPLETED. Delivery: PENDING → DISPATCHED → COMPLETED. Dispatch requires a buyer-visible note for agreed fee/courier/tracking arrangements. UI confirmation is required before each update; the backend checks current staff access, verified PAID state, no reconciliation flag and an optimistic revision. Concurrent updates have one winner and an actor audit. No unpaid order can be marked fulfilled. Test orders remain visibly marked practice only.

## Acceptance walkthrough

Buy one tee and cap for pickup using Paystack TEST, then confirm at /merch/orders. As organizer, mark Ready and then Completed. Place another delivery order, consent to the separate fee, confirm payment, add mock courier/fee arrangements, Dispatch and Complete. Check totals, phone layout and your own buyer session isolation. Close products or set MERCH_SALES_ENABLED=false after the walkthrough if the catalogue is not ready for public sales.

## Organizer inventory

Open `/admin/merch/inventory` from Merch operations. Each product shows size, available, reserved, sold and total capacity. Capacity includes sold and reserved units; it is not a quantity to add. Save applies all size capacities and the product sales switch atomically. Closing a product prevents new reservations while existing orders remain valid. Opening also requires configured payments and MERCH_SALES_ENABLED=true. Stale settings require a reload. Counts reflect stored reservations; expiry processing releases expired holds. Test and live orders share inventory, so use separate databases for production and test practice. No migration is required for this screen.

## Automated shipping update

New delivery checkout now collects the configured delivery fee with merchandise through Paystack; configure destinations at /admin/merch/shipping. The old separately quoted flow described above applies only to orders made before this update. New order receipts retain a shipping snapshot, and full pre-dispatch refunds include paid shipping. Event pickup remains free. See shipping-payments.md for schema/migration installation, pricing rules and acceptance.

Catalogue editing, variant availability and filtered order/CSV tools are now implemented. See merch-catalog-orders.md for deployment and operational instructions.
