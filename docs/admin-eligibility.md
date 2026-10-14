# Admin home and KALA eligibility

## Install

Merge the source and `20261012201000_kala_eligibility` migration. Keep your environment files, Prisma datasource/prisma.config.ts configuration and existing Pro vercel.json cron settings.

```sh
npm run db:deploy
npm run db:generate
npm run typecheck
```

Restart development. Apply the migration to the deployed application's database before deploying the updated code. No seed is required. All eligibility policies start disabled; existing sports, registration switches, rosters, approvals, tables and stock are preserved.

## Central organizer navigation

Bookmark `/admin`. The control room checks the existing enabled ADMIN session before showing its organizer destination links:

- KALA roster review, registration settings, team/representative transfers and eligibility requirements.
- Concert ticket operations, table bookings and payment support/refunds.
- Merch orders, inventory and delivery rates.
- Concert ticket check-in and separate VIP parking check-in.

Every admin page now has an “Admin home” return link. Destination APIs still enforce their own permissions; the hub does not replace authorization. Scanner accounts can continue using staff check-in routes but cannot access the organizer hub. Google sign-in can return to `/admin` or the eligibility page.

## Configure real eligibility rules

Open `/admin/kala-games/eligibility` as an enabled ADMIN. Add a sport in registration settings first if needed. For each sport:

1. Enter the confirmed eligibility requirements as plain text (5–4,000 characters). These are supplied by the organizer; no age, enrolment, university-domain or other condition is seeded or assumed.
2. If needed, tick “Require an eligibility statement or reference.” Describe the actual statement/reference the representative should provide in the requirements text.
3. Tick “Apply this policy to new submissions” and save.

Policy saves have revision checks, event/sport scope checks, ordered locks and an actor-linked before/after audit. Configuration does not reopen registration. A rule update increments its version; it never rewrites submitted declaration records. A disabled policy can retain its configured text for later re-enabling, but requires no new declaration while disabled. The public catalogue redacts disabled requirement text.

Evidence in this implementation is a private text statement/reference, not a document upload. There is no automated enrolment, identity, age or eligibility verification. Organizers review the supplied statement and any referenced evidence using the procedures they specify. A file-upload workflow would need its own private storage, access and retention design.

## Representative submission

At `/kala-games`, each editable roster shows its sport's current enabled requirements. Save player edits first. Confirm that every player in the saved roster meets those requirements and provide the requested statement/reference. The server requires the current policy version, explicit confirmation and any mandatory evidence before submission. Stale policy versions require a reload and renewed confirmation; client-supplied rule text, member hashes or representative IDs are rejected.

The submission captures the rule text/version, evidence requirement, response, declaring representative's name/email, submission time and a fingerprint of all saved player keys/names/jersey numbers/captain flags. Registration remains free, and no payment order is created. Changes to policy wording or team ownership do not rewrite the submitted declaration.

Previously submitted or approved rosters retain their original terms, including rosters submitted before any policy existed. DRAFT and REJECTED rosters use current rules when next submitted. This is not a retroactive eligibility re-review system; configure policies before opening registrations when they must apply to the full field.

## Organizer review and corrections

Use the existing `/admin/kala-games` roster-review queue. A submitted declaration displays the captured rules and statement beside the saved players. Approval requires checking “I checked the captured eligibility requirements and submitted statement.” The server independently requires this confirmation and verifies the declaration's player fingerprint. Roster approval and eligibility approval commit together under the roster lock.

Rejection requires an explanation and records both the roster rejection and declaration rejection. A representative may correct a rejected roster through the existing save/resubmit flow. Saving clears the active declaration pointer without deleting history. Resubmitting creates a new declaration against the current rules. Earlier responses, rules and decisions remain immutable.

“View eligibility history” retrieves up to 20 declarations for a roster. History is accessible only to the current team representative or enabled ADMIN; hashes, auth subjects and internal reviewer IDs are excluded from the response. A representative transfer retains team declaration history but removes the previous representative's access. The original declarant remains recorded even when the team moves to a new account. Approved rosters stay locked.

## Acceptance and remaining scope

Check `/admin` navigation and permission boundaries with organizer, scanner and normal accounts. With disposable TEST teams, configure a real-shaped policy, test required evidence and consent, change a policy while a browser has an older version, submit, approve/reject, correct/resubmit and inspect history. Confirm existing approvals remain unchanged, and transfer a team to verify history access changes. Run native PostgreSQL CI and hosted/mobile acceptance.

Initial round-robin/knockout tournament operations are now included; see kala-tournaments.md. Sport scoring/tiebreak rules and tournament formats must be explicitly configured rather than inferred. Notifications and private document uploads are not included in this update.

## Rejecting an approved roster

Open organizer roster review, select Approved, enter a reason and choose Reject, then Confirm decision. A nonblank reason is required. The roster becomes Rejected and its representative can correct and resubmit it for a fresh approval. Players and earlier eligibility declarations stay on record; an earlier approved declaration is historical evidence and does not override the current roster rejection. Corrections create a new declaration when eligibility is enabled.

If the roster is a tournament draw entry, rejection automatically unpublishes that tournament. New results and publication are blocked while any entry is not approved. Existing fixtures and results remain recorded; schedules and result clearance remain available. Reapproval clears the hold but does not automatically republish. Review any affected results before explicitly publishing again. Removing or replacing an entry requires the existing safe reset workflow; there is no automatic forfeit or result deletion.

The change needs no database migration. Rejection and tournament review holds record the organizer, reason and revisions in audit history. Concurrent or stale reviews cannot overwrite a newer decision.
