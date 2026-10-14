# Pre-launch work tracker

## Completed implementation

- Central organizer control room at /admin with links back from all admin sections.
- Free representative-managed KALA rosters, corrections, review and organizer settings; adding sports to existing teams and verified representative transfers with audit history.
- Per-sport eligibility policies, representative declarations/evidence statements, immutable history and combined eligibility/roster review.
- Initial KALA round-robin/knockout draws, scheduling, scores, standings, bracket advancement, public publication controls and audited corrections.
- Ticket checkout, verified payment, account QR tickets, scanner and organizer sales/inventory.
- Ticket email outbox, table/merch/KALA notifications, encrypted snapshots, leases, bounded provider retries and organizer retry/resend controls.
- Merch checkout, pickup/delivery fulfilment, organizer inventory and stock guards; catalogue editing, order search/filters, summaries and CSV exports.
- Engines/Autobots/Machineries table checkout, organizer inventory/assignments/arrival and separate VIP parking passes/check-in.
- Supplied designer visual system extended through customer, account, organizer and staff screens; UI/UX spacing, hierarchy, responsive checkout, navigation and catalogue disclosure polish (ui-polish.md).
- Ticket/merch expiry scheduler routes, configurable email batch cap and daily/pro cron config merge script.

## Next implementation work

1. Full-payment refund and late-payment reconciliation implementation is complete; hosted acceptance remains. Unpaid cancellation, partial refunds and fulfilled-goods returns remain separate work.
2. Table, merch and KALA transactional notifications implemented; enable the feature flag and complete hosted provider/account acceptance (notifications.md).
3. Email failure visibility and controlled retry/resend implemented; test recovery with disposable recipients (notifications.md).
4. Merch catalogue editing and order search/status filters/summaries/CSV exports implemented; configure actual products/artwork and complete hosted acceptance (merch-catalog-orders.md).
5. Staff access management UI and audit history implemented; complete hosted role/device acceptance (staff-access-audit.md).
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

- KALA: additional sports and representative transfers implemented (kala-team-expansion.md). Eligibility policies/declarations/review implemented (admin-eligibility.md). Initial tournament operations implemented (kala-tournaments.md); configure actual formats/scoring/tiebreakers, court/timetable details and hosted acceptance. Broader formats remain future work.
- Tables: organizer booking management and VIP parking — implemented. Configure real table/parking capacities and per-package vehicle allocations; guest counts/seating remain organizer-arranged. See tables-parking.md.
- Delivery: automated shipping fee payments — implemented for new orders. Configure real rates and complete hosted acceptance; existing orders retain separate-quote terms. See shipping-payments.md.

Current automated result: 247 unit/database/integration tests. Design checks covered ten routes at four widths; the new payment-support page was separately tested at four widths, including refund preview/confirmation and provider status lookup. This does not substitute for hosted/native database or physical device acceptance.

Approved roster rejection with a required reason, representative correction/resubmission and tournament review holds is implemented; see approved-roster-rejection.md.
