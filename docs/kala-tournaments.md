# KALA tournament operations

## Install

Merge the source and `20261013095000_kala_tournaments` migration. Preserve your environment files, Prisma datasource/prisma.config.ts setup and existing Pro vercel.json cron settings.

```sh
npm run db:deploy
npm run db:generate
npm run typecheck
```

Restart development. Apply the migration to the deployed app's database before deploying the new source. No seed or new secret is required. The migration adds Tournament, TournamentEntry and Fixture; no tournament, draw, scoring formula, fixture time or venue is seeded. Registration remains free and existing roster/eligibility reviews are preserved.

## Configure and draw

Go to `/admin` → Tournament operations (`/admin/kala-games/tournaments`). Select the sport. An enabled ADMIN can operate tournaments while registration is closed.

Supported formats:

- **Single round robin:** each selected team meets every other selected team once. Odd entry counts have idle rounds, not fabricated matches. Configure the score label, integer points for a win/draw/loss, whether tied final scores are permitted, and optional ordered tiebreakers (wins, score difference, scored total). No point values are guessed. Primary ranking is configured league points. Teams equal under all configured criteria retain a tied rank; alphabetical display order never decides qualification.
- **Single elimination knockout:** a complete bracket rounds up to the next power of two, records draw byes and advances those teams without fake scores. Score label is explicit. A tied final score needs a selected qualifying team and a public decider explanation. There is no assumed penalty, overtime or other tie-resolution rule.

Save the rules, then choose 2–32 approved roster entries for that sport and confirm “Generate random draw.” The 32-entry limit bounds this initial implementation's draw and transaction size; it is not an eligibility rule. Selected entries are shuffled with Node's cryptographic random generator. The generated order, pairings, bracket targets and actor are audited. This is a recorded random draw, not an externally verifiable draw protocol or a merit-based seeded draw.

Only approved rosters in the selected event/sport qualify as entries. Draws store team-name snapshots and roster references without exposing player/contact data publicly. Submitted/approved rosters stay locked. Policies configured after older approvals do not retroactively change those approvals; eligibility continues to follow the reviewed submission terms.

Rules are locked once a draw exists. To change them, unpublish and reset an unused draw. Reset requires confirmation and a reason, and is blocked while any current result remains FINAL. If results must be removed, clear them explicitly first; earlier draws and score changes remain in AuditLog even after fixture rows are reset. Automatic seeded brackets, multiple groups, group-to-knockout stages, two-leg ties, head-to-head criteria and automatic qualification from tied standings are not included in this first implementation.

## Scheduling and results

Choose a fixture round to keep the organizer screen manageable. Set each played fixture's start time as ISO 8601 with an explicit timezone (for example, +01:00) and its venue. Public times display in Africa/Lagos / West Africa Time. Unknown schedules show “to be announced.” Scheduling does not assume match duration, court capacity or enforce time/venue conflicts; those business values have not been configured. Confirm the actual day and timetable operationally.

Enter integer non-negative home/away scores (maximum 100,000), an internal verification/correction reason and explicit result confirmation. The API derives the winner from unequal scores. Round-robin ties are accepted only when configured. Knockout tied scores require the actual advancing team and decider explanation; the explanation is public, while the staff reason remains private.

Knockout winners populate the correct next-round slot automatically. Future fixture labels identify their preceding qualifying matches. A draw bye cannot be scored or cleared as a played result. Fixtures with unknown qualifiers cannot receive results. Recorded scores update computed standings or bracket progress; a completed knockout final identifies its winner.

Updates use fresh organizer authorization and fixture/tournament revision checks under locks. Corrections retain before/after score evidence and actor/reason audits. If a correction changes a qualifying winner, later-round results must be cleared first, working backward from the final. This prevents changing opponents underneath a played descendant. Correcting a score while retaining the same winner is allowed without invalidating later qualifiers. Clearing a result withdraws the dependent qualifier and recalculates standings; schedule edits to a final match require clearing its result first.

## Publication and public page

Confirm publication explicitly after the draw exists. `/kala-games/fixtures` shows only published tournaments, team names, rules, fixtures, results, standings and applicable decider notes. It does not expose roster members, representatives, eligibility evidence, staff reasons, staff identities or internal revisions. Public reads use a consistent database transaction snapshot. Unpublishing hides the entire tournament.

Schedule changes and confirmed results become visible immediately while the tournament is published. This is tournament-level publication control, not a separate editorial approval queue for every score. There is no automatic polling/push service; users choose “Reload results.” Tournament operations are linked in the central admin hub and KALA pages link to the public fixture page.

## Acceptance

Use approved disposable test teams to check round-robin pair completeness, configured draw/no-draw rules, standings corrections and unresolved ties. For knockout, check odd entry counts/byes, both sides of advancement, tied-score deciders, later-round correction blocking, clearing dependent results, completion and winner display. Test roster/event scope, stale requests, concurrent draws/results, publication and public redaction. Run native PostgreSQL CI and inspect hosted physical mobile browsers before publishing real fixtures.

This slice does not send notifications, change payments, create individual guest tickets or book venues. Tournament notification/score push services and broader formats remain subsequent work. Staff audit history is stored in the existing AuditLog; the general audit-history UI is still pending.

## Rejecting an approved roster

Open organizer roster review, select Approved, enter a reason and choose Reject, then Confirm decision. A nonblank reason is required. The roster becomes Rejected and its representative can correct and resubmit it for a fresh approval. Players and earlier eligibility declarations stay on record; an earlier approved declaration is historical evidence and does not override the current roster rejection. Corrections create a new declaration when eligibility is enabled.

If the roster is a tournament draw entry, rejection automatically unpublishes that tournament. New results and publication are blocked while any entry is not approved. Existing fixtures and results remain recorded; schedules and result clearance remain available. Reapproval clears the hold but does not automatically republish. Review any affected results before explicitly publishing again. Removing or replacing an entry requires the existing safe reset workflow; there is no automatic forfeit or result deletion.

The change needs no database migration. Rejection and tournament review holds record the organizer, reason and revisions in audit history. Concurrent or stale reviews cannot overwrite a newer decision.
