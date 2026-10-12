# Table bookings and VIP parking

| Category | Price per table | Code |
| --- | --- | --- |
| Engines | ₦3,000,000 | engines |
| Autobots | ₦5,000,000 | autobots |
| Machineries | ₦10,000,000 | machineries |

## Install

Merge the new source and migration files. Keep your environment files, Prisma datasource/prisma.config.ts setup, and existing Pro cron settings in vercel.json. If your datasource URL is already supplied by prisma.config.ts, preserve that configuration and merge the added models/fields without reintroducing the schema URL.

```sh
npm run db:deploy
npm run db:generate
npm run db:seed
npm run typecheck
```

Restart local development. Apply the migration to the database used by the deployed app before deploying the new source. This migration adds TableInventory, ParkingPass, ParkingAdmission, parking allocations on order lines, and table assignment/arrival fields on orders. No old order gains a parking entitlement. Seeding creates missing categories with zero capacity and disabled sales and does not reopen anything or reset stock. It updates these category names to the approved names. Migration deployment and the running app must use the same Neon branch; check .env.local overrides if P2022 returns.

## Configure

1. Sign in as an enabled ADMIN and visit `/admin/tables`.
2. Enter confirmed table counts for each category and overall VIP parking capacity in vehicles. Set each category's included vehicle passes per table before enabling it. No allocation is seeded or assumed. One pass means one vehicle with one entry.
3. Enable the desired categories and save. TICKET_SALES_ENABLED=true, the correct Paystack configuration, and TICKET_TOKEN_KEY are required.
4. Open concert sales in `/admin/tickets` if closed. A table category can be used even if Regular/VIP are disabled. The environment and Event sales switches apply to tables as well as individual tickets. Closed/disabled categories retain an email enquiry option if TABLE_ENQUIRY_EMAIL is configured.
5. Confirm guest counts, seating and any package benefits directly with the buyer. These business values have not been supplied, so the app does not create guessed group guest tickets. The checkout explicitly asks buyers to agree to these arrangements. Final guest entitlement policy and capacity accounting remain launch requirements.

The settings screen selects test/live **booking listings**, but stock and configuration are shared within one database, just as with existing tickets/merch. Use separate test/live databases for launch. Configuration edits do not change existing orders' prices or captured parking counts. Overall capacity cannot fall below held plus paid vehicle allocations, and table capacity cannot fall below held plus sold tables. Parking capacity is an event allocation, not a count of vehicles currently onsite; entry does not free a pass for another sale.

## Buyer and organizer flow

Buyers book one table per checkout from `/tickets` or the homepage. Price and included parking allocation are displayed, and checkout binds the accepted allocation so a changed setting requires a reload. Tables and their included parking allocation are held together for 15 minutes. The existing ticket-expiry cron releases both exactly once. Payment verification checks the existing reference, buyer email, amount, currency, domain and provider transaction rules. Late or mismatched payments go through payment support; no entitlement is issued while on hold.

A confirmed table appears in `/tickets/orders` with its private parking QR codes. It does not create a single misleading concert ticket for the whole party. Table confirmation email is not implemented yet; account retrieval works immediately.

Organizers filter bookings by payment mode at `/admin/tables`, see payment/parking status, assign a table label/location, and write a buyer-visible note. Notes are plain text. Labels are normalized to uppercase, and a label cannot be assigned to two paid bookings in the event. Updates have revision checks and actor-linked audits. The table-arrival action requires explicit confirmation and the configured ADMISSION_MODE. Table arrival is separate from parking entry; neither creates individual concert admissions.

## Parking check-in

`/staff/parking` uses enabled ADMIN/SCANNER accounts and the existing ADMISSION_MODE (live by default). Parking codes start with `park_` and are accepted only by parking routes; concert QR codes are accepted only by concert admission routes. Parking confirmation rechecks current paid status, reconciliation/refund holds and verified payment mode under the order lock. A duplicate attempt shows USED and its timestamp. Parking entry never consumes a concert admission.

Camera access uses the same HTTPS/localhost requirement as concert scanning. A parking code can also be entered manually. Camera permission is allowed only on `/staff/check-in` and `/staff/parking`.

## Refunds and acceptance

Use `/admin/payments` for table payment reconciliation/full refunds (listed under the existing TICKET order kind). Preview verifies the provider-paid amount; initiating a refund voids unused parking codes immediately. A processed matching full refund releases the sold table and parking allocation exactly once. Pending, unknown or failed refunds remain held for support. A used parking pass or recorded table arrival blocks automated refunds and needs separate review. No guessed partial-refund or returns rules are added.

Before opening real sales, use Paystack TEST to check each category, accepted parking counts, callback/webhook replays, account ownership, assignment visibility, expired holds, late payments, and a full unused-table refund. Set ADMISSION_MODE=test only in the test environment to exercise separate parking and table arrival; restore live for production. Check a printed parking QR and camera on a physical device. Configure real capacities/vehicle allocations and confirm guest/seating policies. Retain the existing Pro minute cron jobs; no new cron is required.
