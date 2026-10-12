# Application integration

## Local startup

Use Node 22. Install with `npm ci`, copy `.env.example` to `.env`, then set your own values. `docker compose up -d` starts local PostgreSQL when Docker is installed. Run `npm run db:deploy`, `npm run db:seed`, and `npm run dev`.

The seed only creates missing events and disabled football/basketball competitions. It preserves existing event settings. No ticket tiers or schools are invented. Unknown times, prices and capacities remain unset. Album and merch sections are informational placeholders while requirements/designs are pending.

## Configure sign-in

A hosted OpenID Connect provider handles passwords, email verification and account recovery. The application implements authorization-code + PKCE (S256), signed ID-token verification (RS256 or ES256), issuer/audience/nonce/state checking, HTTPS provider endpoints and encrypted HttpOnly sessions. Only identities whose provider asserts `email_verified: true` can register. Session duration is at most one hour and never exceeds the ID token's expiry. Phone numbers are self-reported, not verified.

Register EXACT redirect URI `APP_ORIGIN/api/auth/callback`. For local development this is `http://localhost:3000/api/auth/callback`. Set provider issuer, authorize/token/JWKS endpoints, client ID and optional confidential-client secret in server environment variables. Confidential clients must support `client_secret_post`. No browser token storage is used. All auth endpoints must be trusted provider-owned URLs. Production APP_ORIGIN must be HTTPS with no trailing slash/path; SESSION_KEY must be 32 random bytes encoded as 64 hex characters. No credentials are shipped. Do not change APP_ORIGIN or key while expecting old sessions to remain valid; rotate intentionally.

This is a single-provider adapter, not an auth-provider deployment. Configure the selected provider before opening registration. Its real login/verification flow needs a staging acceptance test; local tests validate encrypted sessions, CSRF boundaries and API rejection paths.

## Configure KALA GAMES

1. Keep `KALA_REGISTRATION_ENABLED=false` until the approved university/team list and rules are available.
2. Use /admin/kala-games/settings to add and enable team options for the seeded KALA event, with canonical key, name and optional university name. Only enabled organizer ADMIN accounts may change settings. Competition `minPlayers`/`maxPlayers` are event-specific; set approved sizes before `registrationEnabled=true`. The API ceiling is 100 players even when no organizer max is set.
3. Configure/test the identity provider and database, then set `KALA_REGISTRATION_ENABLED=true`. Open registration in the settings dashboard. The event, competition and team-option switches must all be enabled.
4. Never expose raw database credentials in the client. Use a runtime role without DDL. This version has no organizer/admin UI; provisioning is a backend task.

Representatives create a team with their verified email/contact and select sports once. Each selected sport gets a draft roster. Sports cannot yet be added to an existing registration from the interface. Representatives can manage multiple teams, but every team has exactly one representative. Duplicate team claims return conflict; transferring representatives is an organizer-controlled future workflow.

## API

All responses use `Cache-Control: no-store`. Authenticated data is scoped by the encrypted session's server-verified subject, not request-body IDs. Mutation requests require an exact Origin match with APP_ORIGIN; cookies are SameSite=Lax. Request JSON is streamed with a 64 KiB cap. Zod rejects unknown fields, malformed IDs, duplicate players, duplicate jersey numbers and multiple captains.

- `GET /api/kala/catalog`: organizer-managed available team choices and sports, plus registration-open flag.
- `GET /api/kala/teams`: current representative's registrations and rosters.
- `POST /api/kala/teams`: `{teamOptionId, sportCodes, representative:{name,phone}}`.
- `PUT /api/kala/rosters/:id`: `{revision,members:[{participantKey,fullName,jerseyNumber,captain}]}`.
- `POST /api/kala/rosters/:id/submit`: `{revision}`.
- `GET /api/auth/login`, `GET /api/auth/callback`, `GET /api/auth/session`, `POST /api/auth/logout`.

The editor saves a full roster replacement within one transaction. Parent locks and revision comparison ensure only one simultaneous writer wins. A failed replacement rolls back deletions. Successful save or submission increments revision; stale requests return 409. Submission freezes edits and records an audit event. No confirmation email is claimed or sent in this version; the interface shows persisted submission status awaiting review.

Lock order is existing roster, team option, then competition. Multi-competition team creation locks competitions in ID order. Ownership is checked before exposing a roster. Normal user-facing errors omit query details, credentials and personal data. Unexpected errors log only a generated request ID.

DB-backed account quota permits 60 authenticated registration API requests/minute. This is shared across instances. Also configure edge-level anonymous/connection rate limits at deployment; do not trust arbitrary X-Forwarded-For. Prune stale quota rows periodically: `DELETE FROM "ApiRateBucket" WHERE "expiresAt" < now() - interval '1 day'` using a scheduled maintenance job. This package does not configure a cloud scheduler.

## Verification and remaining work

`npm test` covers migrations, invalid database writes, strict request validation and encrypted sessions. `npm run test:integration` requires TEST_DATABASE_URL for a disposable PostgreSQL database; it creates a random isolated schema, runs the actual Prisma migration runner, tests service transactions and drops only that schema. The GitHub workflow provides PostgreSQL 17 and runs these tests plus TypeScript and production build checks. Do not point tests at a production database.

Before launch: real-provider sign-in acceptance, native PostgreSQL CI execution, browser/device QA with approved mockups, admin review/eligibility workflows, monitoring, backups and privacy/retention policy. Concert checkout and reservation handlers are now implemented (see ticketing.md). Scanner UI and ticket email delivery are implemented; merch sales are implemented (see merch.md); refunds remain separate work. No live database or payment provider has been configured.

## Dependency compatibility

React and React DOM are pinned to 19.3.0. Prisma 6.19.0 tooling uses overrides for effect 3.20.0 and deepmerge-ts 8.0.0 to remove reported advisories while preserving the SQL migration contract. Schema validation, client generation, type checks, tests and build were re-run after these changes. Keep the lockfile; review/remove overrides when upgrading Prisma. Full npm audit returned zero advisories at this check; this is not a security certification.

## Diagnosing a registration 503

The runtime Prisma client now uses a 15-second interactive transaction timeout and 10-second acquisition limit for remote development database latency. Restart the development server after changing this constructor so the cached client is recreated. The observed 6.5-second failure suggested the previous default 5-second timeout, but the remote error has not been confirmed. Unexpected error logs now include errorType and a Prisma error code without raw messages, credentials or request payloads. Retry and inspect the sanitized code; P2028 requires transaction lifecycle investigation, P1001 connectivity, P2021/P2022 schema/migration checks. No migrations or database data changes are part of this patch.

## Organizer review

The organizer page is /admin/kala-games. Its API checks the current StaffUser row on every request; only enabled ADMIN staff can list or review rosters. Sessions contain identity only, never trusted role claims. Review accepts SUBMITTED rosters only, checks the revision under a row lock, increments it, and atomically persists the decision, review timestamp, representative-visible note and actor-linked audit entry. A competing or repeated decision returns 409. Rejection requires a nonblank note. Approved rosters remain locked. Rejected rosters allow representative corrections and resubmission while registration is open.

After a verified account has created its team, a trusted operator with database access can grant it admin rights locally:

```sh
node --env-file=.env --import tsx scripts/grant-admin.ts "your-google-email@example.com"
```

The script resolves an existing verified representative identity and logs the grant in AuditLog. It does not create an account or grant roles by browser request. Revoke access by setting StaffUser.enabled=false in trusted admin tooling. Reviewer contact information and roster players are available only through the authorized API; the public page shell carries no personal data and is marked noindex.

Lists are paged at 50 rosters, filter pending/approved/rejected, and support a cursor. No review emails are sent. No database migration is required for this addition: it uses existing StaffUser, SportRoster review fields and AuditLog relations.

## Rejected roster corrections

Copy the updated `src/`, `prisma/migrations/`, and tests into your project, then run `npx prisma migrate deploy` before restarting the app. The new migration changes the database member guard to allow edits to rejected rosters; existing migrations remain unchanged.

Representatives can edit rejected rosters while registration, their team, and their sport are open. Saving corrections keeps the status REJECTED and retains the organizer note. Resubmitting validates player limits, updates the submission timestamp and revision, and returns the roster to SUBMITTED. The previous note remains visible until the next review replaces it. A separate ROSTER_RESUBMITTED audit entry records the new revision. Submitted and approved rosters remain locked.

## Organizer settings

Apply the new migration and regenerate Prisma Client (`npx prisma migrate deploy` then `npx prisma generate`). The migration adds Event.registrationEnabled (closed by default) and Event.settingsRevision. After installing, existing registrations and review decisions remain intact; an organizer must explicitly open registration at /admin/kala-games/settings. KALA_REGISTRATION_ENABLED remains an environment safety switch: both switches must be open for representative writes.

The dashboard adds/enables/disables universities and sports, sets 1–100-player roster sizes, and confirms opening/closing registration. Existing team keys and sport codes cannot change. Registered team names/universities are locked to preserve registration snapshots. New limits cannot invalidate SUBMITTED or APPROVED rosters. Disabling teams/sports retains rosters and stops related representative writes; organizer review still works when registration closes. There is no deletion or transfer flow.

GET/PATCH /api/admin/settings require an enabled ADMIN, use account rate limiting and no-store responses. Mutations require exact origin and strict input validation, lock current staff and event settings, check settingsRevision, and persist an actor-linked audit with the new revision. Representative transactions hold the event lock before roster/option/competition locks, so a concurrent closing operation cannot race a write after it completes.
