# Phase 1 database foundation

This database foundation is now integrated with a Next.js application (see application.md). No pre-existing repository was available. No live website or database has been deployed.

## Confirmed scope

One RISE OF THE MACHINE destination for the concert, KALA GAMES registration, and future album/merch sections. Concert date: 20 December 2026. KALA GAMES: 19 December 2026. Regular ₦20,000 and VIP ₦100,000 are confirmed. Table enquiries show ₦3m/₦5m/₦10m. Event times, actual ticket capacities, universities and roster sizes still require confirmation. Seed adds confirmed paid-tier prices with zero capacity and closed sales.

KALA GAMES registration is free: there is no order/payment relation or registration charge. A TeamRegistration has exactly one Representative; the representative can submit multiple sport rosters under that team. teamKey is a server-assigned canonical university/team identity, not a browser-generated spelling, preventing spelling variants from creating duplicate registrations. University name is optional for non-university teams. One team per canonical key per event and one roster per team/competition. A representative may manage more than one team; this does not impose an unrequested one-team-per-person policy.

Roster states: DRAFT → SUBMITTED → APPROVED/REJECTED; rejected rosters permit representative corrections and resubmission; withdrawal and reopening approved rosters require a future authorized organizer workflow. Submission freezes member edits. To change a submitted roster, staff reopens it and increments revision in the same transaction. Configure football/basketball competitions and player limits only after rules are confirmed. Player names, local participant keys, optional jersey numbers and captain flags are retained. Do not collect identity documents or birth dates without a concrete eligibility requirement.

## Ticketing transaction contract

Amounts are integer minor units (kobo for NGN). Currency is snapshotted on each order/payment. Prices and totals come from server catalog data. OrderLine preserves the purchased unit price. Composite foreign keys prevent mixing tiers and orders from different events.

1. Reserve: begin transaction; acquire tier rows in sorted ID order; atomically increment reserved only where capacity - sold - reserved >= quantity and active = true; create order/lines; calculate total using server prices. Reuse idempotencyKey only for the same authenticated/request context and identical input; return conflict otherwise. Never expose orders using a guessable key.
2. Initialize Paystack outside the DB transaction using a unique attempt reference. Persist and reconcile failures; multiple attempts per order are allowed.
3. Verify provider server-side and validate reference, amount, currency, merchant environment and successful status. A redirect alone is insufficient. Lock order first, then inventory in consistent order. Check expiry/state and verification evidence. Mark attempt VERIFIED, mark order PAID, move reserved to sold, issue one ticket per ordinal and insert an outbox delivery message in ONE transaction. If the order is already PAID, return existing tickets. SQL guards do not verify Paystack; the application owns verification and exact total matching.
4. Expiry job: lock order and tier rows in the same order; only expire RESERVED orders and decrement reserved once. Late successful payments require explicit reconciliation/refund, never automatic issuance against released inventory.
5. Admission: authorized scanner checks the token hash server-side and INSERTs Admission. Its ticket primary key makes concurrent double admission fail atomically. Database checks active ticket, paid order and enabled staff. Do not update/delete admission records via API. Audit denied attempts separately without storing raw tokens.
6. Refund workflow is application work for Phase 2/3. Do not set REFUNDED without provider reconciliation; void relevant tickets in the same transaction. This initial schema does not yet model partial refunds.

Use cryptographically random 256-bit opaque QR tokens; store only SHA-256 hash. Hash is not the ticket ID. This deliberately avoids embedding attendee PII in QR codes. Issue/delivery retries preserve original tokens through encrypted ticket storage and an encrypted email snapshot in the outbox. Never put plaintext tokens or payment secrets in logs.

## Authorization and operations

Auth provider is not chosen: authSubject fields bind verified external identities without storing credentials. All roster reads/writes enforce representative ownership; clients cannot assign representatives, change status, audit records or payment fields. Staff roles and enabled flags require server authorization on every request. The schema itself is not an authorization system. Runtime DB role must have no DDL privileges; restrict Admission UPDATE/DELETE and AuditLog UPDATE/DELETE. Use a separate migration role.

Lock roster parent before editing members or submitting; verify ownership, status, revision and registrationEnabled within transaction. Trigger validates nonempty/configured roster limits on submission; API enforces permitted state transitions and verifies representative contact. Members cannot be moved to another roster.

No production data/credentials are included. No migrations were applied to a live database. Back up before production changes, review SQL, deploy from one migration job and monitor. Do not use db push in production: it omits custom integrity constraints/triggers. Merch stock/shipping/refunds and album editorial models will be separate future migrations once their requirements are settled.
