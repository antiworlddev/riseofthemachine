# Transactional notifications and email operations

## Deployment and enablement

Merge the update while preserving environment files, prisma.config.ts and the existing Vercel Pro vercel.json. Apply the migration and generate the client for the intended database:

```sh
npm run db:deploy
npm run db:generate
npm run typecheck
```

The migration adds outbox revision/generation, mode/scope and encrypted notification snapshot fields, retaining existing ticket messages and their original first-generation delivery keys.

Additional notifications default OFF. In local/Vercel environments, enable them only after the migration and existing email settings are ready:

```dotenv
NOTIFICATIONS_ENABLED=true
KALA_NOTIFICATION_MODE=test
```

Set KALA_NOTIFICATION_MODE to the same test/live value as TICKET_EMAIL_MODE for that environment. Financial notification mode comes from the verified payment, rather than a browser request. Retain existing EMAIL_DELIVERY_ENABLED=true, RESEND_API_KEY, verified TICKET_EMAIL_FROM, APP_ORIGIN and TICKET_TOKEN_KEY. Do not rotate the encryption key without a migration/re-encryption plan: it protects ticket codes and queued notification snapshots. Misconfigured encryption can roll back a transaction that must queue a notification while the flag is enabled; disabling the flag stops additional event creation until configuration is repaired.

The existing /api/jobs/ticket-emails cron now delivers ticket and additional emails within the same batch/deadline budget. No new cron route or Vercel schedule is required. Ticket work receives a first budget share, additional notifications use the remaining share, and spare capacity returns to tickets. The existing script name remains usable:

```sh
node --env-file=.env --import tsx scripts/deliver-ticket-emails.ts
```

This command sends real emails when configured; use disposable accounts and test mode for hosted acceptance. Test mode marks the subject/body but still sends to the actual recorded recipient. This implementation does not automatically backfill older orders or roster events from before NOTIFICATIONS_ENABLED was set.

## Events

| Event | Recipient | Content |
| --- | --- | --- |
| Verified table payment or accepted late table payment | Recorded buyer email | Captured table category, paid amount, VIP parking allocation and private account link |
| Verified merch payment or accepted late merch payment | Recorded buyer email | Captured products/sizes/quantities, paid amount and pickup/delivery terms |
| Merch ready, dispatched or completed | Recorded buyer email | Captured items and the buyer-visible fulfilment note/status |
| KALA submission/resubmission | Current representative email at the event | Team/sport and submitted status; free registration confirmation |
| KALA approval/rejection, including approval revocation | Current representative email at the event | Decision and organizer reason/note; correction/resubmission instructions when rejected |

No private parking codes, athlete list, eligibility evidence or staff-only payment notes are included in additional email bodies. Table buyers view their private parking passes in their account; this slice does not email separate parking QR attachments or announce final seating assignments. KALA notifications go to the representative, with no organizer-copy, SMS, WhatsApp, tournament result push or mass marketing feature.

Events enqueue in the same database transaction as the business change. If the transaction rolls back, its message rolls back. Unique event keys and existing order/roster revision guards prevent repeated callbacks or competing decisions from queuing duplicate events. Recipient/content snapshots are encrypted at rest; only entity references are stored in JSON payloads. HTML escapes user-entered names, reasons and notes.

## Delivery protections

Delivery uses provider idempotency keys, a two-minute database lease, frozen payloads after first preparation, bounded exponential backoff, eight-attempt review limits and a conservative 23-hour retry window. Permanent provider failures (including a rejected sender) become NEEDS_ATTENTION. Sent messages clear the transient frozen delivery payload; encrypted event snapshots remain for controlled resends and future retention work.

Current database state is checked before sending. Financial confirmations require a verified payment in the message mode and a PAID order without a reconciliation/refund hold. KALA requires the same representative identity/email, roster revision and status as the snapshot. Fulfilment updates require the captured revision/status. Older queued statuses are suppressed as NOTIFICATION_SUPERSEDED, and transferred representatives as RECIPIENT_CHANGED. These are expected safety suppressions, not proof of a provider outage. Emails already handed to the provider cannot be recalled; a subsequent change or transfer does not revoke an email already in flight.

## Organizer operations

Open /admin → Email operations. Select test/live and QUEUED, RETRYING, NEEDS_ATTENTION, SENT or ALL. The screen exposes message type, entity/message IDs, attempts, next/sent times, safe error codes and lease state, rather than recipient/body snapshots, encrypted fields, provider response bodies or private admission codes. Enablement labels reflect environment flags, not a provider health test. Messages are paginated by immutable UUID, 50 per page.

Retry requires an organizer, current message revision, reason and explicit confirmation. It preserves attempts, first attempt time, frozen content and delivery generation/key. Fix a sender/provider problem first. A delivered message, exhausted attempt count or expired retry window requires an explicit resend instead. Retries do not bypass current record/recipient checks.

Resend requires an additional acknowledgement that the recipient may receive a duplicate. It increments the delivery generation/key, resets attempts/window and rebuilds the delivery envelope from current sender/origin configuration while retaining the original event snapshot. The current snapshot must still be safe for its entity; resending does not invent a newer approval/status or redirect to a different recipient. Never-attempted messages use retry rather than resend. Active delivery leases cannot be edited. Concurrent or stale operations cannot replace newer instructions. Actor/reason and possible duplicate acknowledgement are recorded in audit history.

## Acceptance and remaining operations

Local tests use isolated embedded PostgreSQL and mocked provider calls. Run native PostgreSQL CI, hosted test/live separation, Resend sender/domain acceptance, old/new account ownership checks, actual cron execution, timeout recovery and controlled resend on disposable accounts. Alerts/backlog metrics, retention/deletion policy and throughput/load sizing remain subsequent work. There is no automatic historical backfill, provider delivery/open/bounce webhook tracking, recipient override or bulk resend in this release.
