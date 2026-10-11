# Organizer ticket operations

Install src/ and scripts/ from the updated package, keep your .env, and restart npm run dev. No schema change, dependency change or migration is required for this dashboard.

Open /admin/tickets with an enabled ADMIN account. The KALA GAMES organizer page links to it. SCANNER accounts can check in tickets but cannot see buyer lists or manage sales.

## Sales and orders

Choose Test orders or Live orders. Summary shows verified gross sales before provider fees, paid order count, active paid tickets, admissions, unexpired reservations and reconciliation flags. Gross sales excludes non-PAID and flagged orders, and requires a verified payment in the selected domain. Inventory counters reflect the whole database; test and live environments must use separate databases. Counts are refreshed on request and are not a real-time analytics stream.

Filter by status or reconciliation. Search accepts an exact buyer email, order UUID or rotm payment reference. Each page contains up to 50 records; Load more uses the last UUID as a keyset cursor and does not expose another event's orders. Buyer names/emails, purchased tier/quantity, payment references/status/provider IDs, ticket states and admission timestamps are visible to authorized organizers. Private/encrypted ticket tokens and provider checkout URLs are omitted.

Reconciliation means a successful late or mismatched payment needs the trusted operator workflow described in ticketing.md. This dashboard does not clear flags, issue tickets, void/refund orders, or change admissions. Refund handling and email delivery remain separate work.

## Ticket settings

Set Regular/VIP capacities and enabled switches, and open/close sales. Review changes before confirming; the settings apply to the configured concert inventory regardless of the payment-mode order filter. Prices remain the confirmed ₦20,000 and ₦100,000. Zero capacity disables a tier. Capacity cannot fall below reserved plus sold. Tier changes and sales state commit atomically.

Opening requires TICKET_SALES_ENABLED=true, valid Paystack mode/secret, TICKET_TOKEN_KEY, and at least one enabled tier with nonzero capacity. The existing live-mode guard still applies. Closing prevents new reservations; previously initialized payments can still be completed and verified. Existing ticket retrieval/check-in is unchanged.

Only enabled ADMIN staff can read or save settings. Mutations require exact-origin/strict input, persistent request rate limiting, current staff/event locks, optimistic event settingsRevision, and actor-linked audit. Concurrent saves have one revision winner; changing capacity races safely with inventory reservations. The setup-ticketing CLI now increments the same event revision.

GET /api/admin/tickets/overview?mode=test|live returns summary and inventory. GET /api/admin/tickets/orders accepts mode, status, q and before. PATCH /api/admin/tickets/settings saves the reviewed capacities, enabled flags, sales state and expected revision. All responses are no-store.

Validation covers staff-only access, mode/event scoping, verified-sales arithmetic, reconciliation filters, exact email search without empty-OR matching, absence of private token fields, capacity rollback, concurrent settings revision, closed-sale reservation denial, environment opening guard, 50+2 pagination without overlap, and API auth/origin/filter boundaries. Browser/device QA and native PostgreSQL concurrency CI remain pending.
