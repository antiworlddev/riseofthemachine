# Additional sports and representative transfers

## Install

Merge the source update and `20261012193000_kala_ownership` migration. Keep your environment files, Prisma datasource/prisma.config.ts setup and existing Pro cron settings.

```sh
npm run db:deploy
npm run db:generate
npm run typecheck
```

Restart local development. Apply the migration against the deployed app's database before deploying new source. The migration adds a positive TeamRegistration.ownershipRevision with default 1 to existing teams. No roster, player, review or payment is removed, and registration is not reopened by migration. No seed is required for this update.

## Add another sport

The existing representative signs in at `/kala-games`. Below their team name, “Add sports” offers enabled sports that do not already have a roster for that team. Select up to five per request. New rosters start as DRAFT; already submitted/approved rosters remain locked and retain their revisions, players, reviews and timestamps. This operation stays free and creates no payment order.

The event/environment registration switches, team option and selected sports must all be open. Add or enable sports with real player-count limits in `/admin/kala-games/settings`; no additional sport or guessed player count is seeded. Save any current roster edits before adding sports because the screen reloads after addition. The server guards team ownership, team revision and duplicate entries under a team lock; concurrent requests have one revision winner.

## Transfer a representative

1. The incoming representative signs in with their own verified Google account at `/kala-games` and saves “Your representative profile” (name and phone). This does not claim any team and is available while registration is closed. Profile identity/email comes from the authenticated session, not the submitted form.
2. An enabled ADMIN opens `/admin/kala-games/teams` and finds the relevant team. The screen shows its current representative and roster states.
3. Enter the incoming representative's exact verified email and choose “Find verified representative.” The preview identifies the existing account. Unknown/unverified or ambiguous accounts cannot be selected; no new account is created by an organizer typing an email.
4. Confirm the source team, current representative and previewed target; enter a reason and tick the ownership-change checkbox. Submit the transfer.
5. The incoming representative reloads `/kala-games` and sees the team. The previous representative loses only that team's access; their other teams remain available.

Transfers are organizer-only and work while registration is closed. They move the whole team, not individual sports. Team revision, current owner and target email/account are checked again under locks. A target profile email change between preview and confirmation requires another lookup. A competing transfer produces a stale-revision response. A transfer back is a new explicit audited action; there is no unaudited rollback button.

Approved/submitted/rejected status, roster membership, submitted/reviewed dates and review notes remain intact. Each existing roster revision increases to invalidate stale editor/reviewer requests; that does not unlock the roster. The new representative can edit drafts/rejected rosters only when the existing registration guards permit it. Team-level ownership locks now serialize roster saves/submissions with transfers, so old sessions cannot write after ownership changes.

Recent transfer history for the current organizer page includes source/target email snapshots, reason, time and organizer actor. No message or email is sent automatically. Representative profile editing does not alter team ownership. Verified email conflicts require organizer support and cannot silently reassign an identity.

## Acceptance and next work

Check with two Google accounts: add a sport alongside an approved roster, save a recipient profile, preview/confirm transfer, verify the previous account loses this team but retains others, and confirm the new account cannot edit approved rosters. Test closed registration, disabled team/sport, stale requests, concurrent transfer/save and a transfer back. Run native PostgreSQL CI and check the flow on physical mobile devices.

This update implements additional sports and representative transfers. Configurable eligibility requirements/evidence and review remain next; fixtures, draws, results and standings follow with explicit sport-specific rules. Registration remains free. No eligibility criterion, tournament scoring rule, fixture or sports quota is invented here.

## Rejecting an approved roster

Open organizer roster review, select Approved, enter a reason and choose Reject, then Confirm decision. A nonblank reason is required. The roster becomes Rejected and its representative can correct and resubmit it for a fresh approval. Players and earlier eligibility declarations stay on record; an earlier approved declaration is historical evidence and does not override the current roster rejection. Corrections create a new declaration when eligibility is enabled.

If the roster is a tournament draw entry, rejection automatically unpublishes that tournament. New results and publication are blocked while any entry is not approved. Existing fixtures and results remain recorded; schedules and result clearance remain available. Reapproval clears the hold but does not automatically republish. Review any affected results before explicitly publishing again. Removing or replacing an entry requires the existing safe reset workflow; there is no automatic forfeit or result deletion.

The change needs no database migration. Rejection and tournament review holds record the organizer, reason and revisions in audit history. Concurrent or stale reviews cannot overwrite a newer decision.
