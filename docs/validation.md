# Validation — 9 October 2026, application v0.2.0

Passed:
- Prisma schema validation and client generation.
- Full npm dependency audit reports zero known advisories after pinning patched tooling dependencies.
- Next.js route generation, strict TypeScript checking and production build.
- 32 migration/request/session tests on PGlite and Node.
- 17 Prisma service/route integration tests against a separate PGlite socket server, with all migration SQL files applied directly. Includes free team creation, duplicate claim/ownership rejection, empty submission, concurrent API save/submit attempts, failed replacement rollback, frozen submissions, closure switch, exact-origin/request validation and persistent quota.

Limits:
- Native PostgreSQL could not run under this workspace's user-namespace restrictions.
- The Prisma migrate deploy engine failed against the embedded socket server; this was NOT counted as a passed check. Migration SQL was instead applied directly with PGlite for local integration.
- Embedded socket multiplexing differs from native concurrent PostgreSQL connections. The native PostgreSQL migration runner and multi-connection behavior still need the included CI workflow, which has not run in this workspace.
- No browser/device visual QA or live OIDC provider login has been performed. Sessions were minted only inside tests.
- No hosted database, cloud repository, payment integration or production deployment was created.

The default integration command uses TEST_DATABASE_URL, creates a random isolated test schema and invokes the actual Prisma migration runner. PREPARED_TEST_SCHEMA is an optional local embedded-test hook and must match rotm_test_ followed by 32 hex characters; CI does not set it. Tests always drop only their isolated test schema.

Organizer review addition: disabled/scanner/ordinary-account rejection, simultaneous opposite decisions, actor-linked review audit, representative-visible rejection feedback, terminal roster locking, admin route authorization, origin validation and required-note checks passed on embedded PostgreSQL. Native PostgreSQL CI and browser/device QA remain pending.

Rejected-roster corrections: type checking, production build, 30 unit/database tests and 15 embedded PostgreSQL integration tests passed. The integration rejection scenario now covers owner-only corrections, registration closure, maximum/minimum player counts, stale revisions, simultaneous resubmission, return to the organizer queue, retained notes, and application/database locks after approval. Native PostgreSQL CI and browser verification remain to be run.

Organizer settings: type checking and production build passed. 32 unit/database tests and 17 embedded PostgreSQL integration tests cover strict settings input, organizer-only access, duplicate/foreign-team rejection, concurrent revision conflict, registered team naming protection, existing roster limits, registration closure/reopening and setup validation, disabled-team writes, and settings endpoint origin/auth boundaries. A failing direct Prisma trigger statement exposed an embedded socket connection-reuse issue; direct trigger checks now run through PGlite's native query API in the database suite. Native PostgreSQL CI and browser/device verification remain outstanding.

Concert checkout: type checking and production build passed; 35 unit/database tests and 27 embedded PostgreSQL integration tests passed. Payment gateway calls are mocked in integration tests; no real Paystack initialization, test payment, or live charge was performed. Coverage includes buyer-bound idempotency, server price calculation, unavailable inventory, concurrent checkout initialization, pending/foreign payments, simultaneous issuance and stable encrypted code retrieval, amount/currency/reference/domain/email mismatches, expiry idempotency and late payment reconciliation, distinct buyers racing the last ticket, uncertain initialization, authenticated/origin-protected APIs, invalid webhook signature and a valid signed replay. Native PostgreSQL concurrency CI, browser/device QA and provider TEST acceptance remain outstanding.

QR and check-in: type checking and production build passed. 36 unit/database tests and 31 embedded PostgreSQL integration tests passed, including QR encoder/decoder round-trip, role and disabled-staff protection, no admission on preview, void/unpaid/reconciliation/wrong-mode rejection, concurrent confirmation with one winner, retry check-in timestamps, scanner/organizer separation, admission origin/auth/strict-input guards and redacted denial audit. Sample QR visually inspected. Production dependency audit reports zero vulnerabilities. Camera hardware, printed QR acceptance, native PostgreSQL concurrency CI and browser/device QA remain to be performed.

Organizer ticket operations: type checking and build passed; 36 unit/database tests and 35 embedded PostgreSQL integration tests passed. New coverage checks organizer-only sales data, test/live totals, exact-search and reconciliation filters, absence of private code/checkout fields, capacity rollback, concurrent settings changes, closing/opening guards, cursor pagination without overlap, and API auth/origin/filter validation. Browser/device QA and native PostgreSQL concurrency CI remain pending.

Ticket emails: typecheck and production build passed. All 37 unit/database tests and 38 embedded PostgreSQL integration tests passed (75 total). Resend calls were mocked; no real emails were sent. Added coverage checks exact email/QR attachments, encrypted snapshots, stable retries, concurrent worker claims, one accepted send, disabled delivery, stale retry review, and blocked void/reconciliation tickets. Inbox delivery and verified-domain acceptance require a configured Resend walkthrough.
