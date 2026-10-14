# Staff access and audit history

## Deployment

Merge the update while keeping your environment files, prisma.config.ts and Vercel Pro vercel.json. This release adds StaffUser.revision and audit query indexes; apply the included migration to each intended database before running the new code:

```sh
npm run db:deploy
npm run db:generate
npm run typecheck
```

Restart locally, then deploy. The migration preserves existing staff accounts and recorded history. Do not run migrations against an unintended database. The trusted grant-admin CLI remains the bootstrap/recovery path and now increments the access revision and uses the same mutation serialization lock.

## Staff access

Open /admin → Staff access. Existing enabled organizers can find a verified account by exact email, preview its identity/current access, choose Organizer or Scanner, enable/disable access, enter a reason and explicitly confirm. The person must first sign in and save their representative profile on /kala-games; no team or roster submission is necessary. This flow does not create external accounts, send invitations or email anyone.

Organizer grants all existing organizer sections. Scanner allows existing concert ticket and VIP parking admission only. There are no per-event/custom roles in this release. Disabled accounts are retained for audit/admission references and lose staff access on their next protected request. Requests already authorized before a change may finish; operations taking staff locks serialize against access changes.

The last enabled organizer cannot be disabled or demoted. Access mutations are serialized under a transaction lock and recheck the acting organizer's current access. Revisions prevent stale previews, including create races, from overwriting later changes. Changes to your own organizer role show a warning and require the same confirmation. No-op changes are rejected. Staff are never deleted through this UI, and auth subjects are never exposed or editable.

## Audit history

Open /admin → Audit history. Recorded actions show the current staff email when an actor exists, action, record type/ID, timestamp and permitted details such as rejection/refund reasons, score changes, access before/after and inventory capacity changes. Staff emails are current labels rather than immutable snapshots of the actor email. Older actions without staff actor links are labeled System / representative; this does not retroactively identify those actors.

Filter by action, staff actor, record type, exact record ID and date range. Date inputs are device local time, sent as explicit ISO instants. Results show newest first, 50 at a time; timestamp/ID keyset pagination avoids overlaps for tied timestamps and newer inserted actions. Filter option lists are capped at 200 distinct values/staff accounts. History is read-only through this UI, and includes existing recorded business actions rather than every page view or complete database change tracking.

Only explicitly allowed metadata fields are returned. Raw provider payloads, payment checkout URLs, admission codes/hashes, encrypted tokens, auth subjects and eligibility evidence are excluded. Inventory variants are capped at 100 details per action. No CSV export or retention/deletion UI is included yet. Direct database operators remain trusted and can bypass application protections; this is not a database-level immutable audit ledger.

## Acceptance

Check with an existing organizer and a disposable verified scanner: grant, disable, restore, promote/demote, stale preview, last-organizer guard, scanner restrictions, and action/staff/date filters. Run the native PostgreSQL CI workflow and verify hosted two-account/device acceptance after migration. No provider/payment/email actions are needed to test this slice.
