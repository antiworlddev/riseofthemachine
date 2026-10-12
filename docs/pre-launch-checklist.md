# Pre-launch work tracker

## Completed implementation

- Free representative-managed KALA rosters, corrections, review and organizer settings.
- Ticket checkout, verified payment, account QR tickets, scanner and organizer sales/inventory.
- Ticket email outbox with encrypted snapshots, leases and bounded provider retries.
- Merch checkout, pickup/delivery fulfilment, organizer inventory and stock guards.
- Supplied designer visual system extended through customer, account, organizer and staff screens.
- Ticket/merch expiry scheduler routes, configurable email batch cap and daily/pro cron config merge script.

## Next implementation work

1. Audited payment reconciliation, cancellation/refund operations and ticket void/merch stock handling tied to confirmed provider outcomes. Partial refunds require explicit data-model work.
2. Merch confirmation/fulfilment emails and KALA submission/review notifications.
3. Email failure visibility and controlled retry/resend support.
4. Merch catalogue editing (names, prices, descriptions, assets, variants) and order search/status filters/summaries/exports.
5. Staff access management UI and audit history.
6. Alerts and queue/backlog monitoring; production email throughput/load sizing.
7. Production database permission review, edge abuse protection, stale quota cleanup and retention implementation.

## Deployment/acceptance work

- Run setup-cron.ts daily on the current plan, deploy and verify all three jobs with the existing server secret. Minute scheduling requires the pro profile after upgrading.
- Run the included native PostgreSQL CI workflow and check actual migration deployment.
- Separate test/live databases, keys and deployment configuration. Test/live inventory is shared within a database.
- Confirm backups and practice recovery.
- Verify physical iPhone/Safari, QR camera/printed tickets, provider failure/replay cases and expected launch concurrency.
- Confirm ticket allocations, merch artwork/size information/stock, delivery arrangements and pickup instructions.
- Provide support contacts and approved privacy/refund policies; replace album/content placeholders.

## Scope decisions before expanding

- KALA: additional sports on existing registrations, representative transfers, eligibility requirements; fixtures/draw/results/standings if desired.
- Tables: retain enquiry flow or add organizer booking management.
- Delivery: optional structured fee quotes/settlement tracking or automated shipping payments; current separately quoted fee stays outside checkout.

Current automated result: 96 unit/database/integration tests plus browser checks on 10 routes at four widths. This does not substitute for hosted/native database or physical device acceptance.
