# Pre-launch work tracker

## Completed implementation

- Free representative-managed KALA rosters, corrections, review and organizer settings.
- Ticket checkout, verified payment, account QR tickets, scanner and organizer sales/inventory.
- Ticket email outbox with encrypted snapshots, leases and bounded provider retries.
- Merch checkout, pickup/delivery fulfilment, organizer inventory and stock guards.
- Engines/Autobots/Machineries table checkout, organizer inventory/assignments/arrival and separate VIP parking passes/check-in.
- Supplied designer visual system extended through customer, account, organizer and staff screens.
- Ticket/merch expiry scheduler routes, configurable email batch cap and daily/pro cron config merge script.

## Next implementation work

1. Full-payment refund and late-payment reconciliation implementation is complete; hosted acceptance remains. Unpaid cancellation, partial refunds and fulfilled-goods returns remain separate work.
2. Table booking confirmation emails, merch confirmation/fulfilment emails and KALA submission/review notifications.
3. Email failure visibility and controlled retry/resend support.
4. Merch catalogue editing (names, prices, descriptions, assets, variants) and order search/status filters/summaries/exports.
5. Staff access management UI and audit history.
6. Alerts and queue/backlog monitoring; production email throughput/load sizing.
7. Production database permission review, edge abuse protection, stale quota cleanup and retention implementation.

## Deployment/acceptance work

- Run setup-cron.ts pro on the upgraded Vercel Pro plan, deploy and verify all three minute jobs with the existing server secret. Existing ticket expiry also expires table holds; no additional job is needed.
- Run the included native PostgreSQL CI workflow and check actual migration deployment.
- Separate test/live databases, keys and deployment configuration. Test/live inventory is shared within a database.
- Confirm backups and practice recovery.
- Verify physical iPhone/Safari, QR camera/printed tickets, provider failure/replay cases and expected launch concurrency.
- Confirm ticket allocations, merch artwork/size information/stock, delivery arrangements and pickup instructions.
- Provide support contacts and approved privacy/refund policies; replace album/content placeholders.

## Approved expansion scope

- KALA: additional sports on existing registrations, representative transfers, configurable eligibility, fixtures/draws/results/standings — approved.
- Tables: organizer booking management and VIP parking — implemented. Configure real table/parking capacities and per-package vehicle allocations; guest counts/seating remain organizer-arranged. See tables-parking.md.
- Delivery: automated shipping fee payments — implemented for new orders. Configure real rates and complete hosted acceptance; existing orders retain separate-quote terms. See shipping-payments.md.

Current automated result: 149 unit/database/integration tests. Design checks covered ten routes at four widths; the new payment-support page was separately tested at four widths, including refund preview/confirmation and provider status lookup. This does not substitute for hosted/native database or physical device acceptance.
