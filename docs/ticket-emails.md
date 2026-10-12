# Ticket email delivery

Paid ticket issuance creates one TICKETS_ISSUED outbox entry in the same transaction as the tickets. The Resend worker sends a private email with one PNG QR attachment per ticket, the original codes and a link to the signed-in ticket page. KALA registration remains free and has no email sender in this slice.

## Local setup

Keep your .env and prisma.config.ts. Copy src/, scripts/, docs/, .env.example and the new prisma/migrations/20261010020000_ticket_emails directory. Merge the added OutboxMessage fields from schema.prisma while retaining your existing datasource URL configuration. No new npm dependency is needed.

```sh
npm run db:deploy
npm run db:generate
```

Add these values to your existing .env:

```dotenv
EMAIL_DELIVERY_ENABLED=true
RESEND_API_KEY=re_your_key
TICKET_EMAIL_FROM=tickets@your-verified-domain.com
TICKET_EMAIL_MODE=test
```

Configure your sending domain in Resend and use a mailbox on that verified domain. The application accepts a plain email address as the sender. APP_ORIGIN must be your application URL, and preserve the existing TICKET_TOKEN_KEY. In Resend's restricted testing environment, recipients may be limited; verify the domain before sending to customers. Test payment emails are marked [TEST] and practice only. Set TICKET_EMAIL_MODE=live in the separate live environment when ready.

Restart the development server. Run one bounded batch:

```sh
node --env-file=.env --import tsx scripts/deliver-ticket-emails.ts
```

The worker reports sent/retrying/blocked counts without email content or ticket codes. Existing paid orders queued before this migration are eligible. If you enable delivery on a database with earlier paid orders, this sends those queued emails too.

## Scheduling

Schedule that command every minute from the project directory, with the production environment loaded. A Unix cron example (replace the path and node executable as appropriate):

```cron
* * * * * cd /path/to/rise-of-the-machine && /absolute/path/to/node --env-file=.env --import tsx scripts/deliver-ticket-emails.ts
```

This release includes the worker, not deployment-specific scheduler provisioning. It sends at most ten emails per invocation (bounded maximum fifty when called programmatically). Multiple workers claim messages through row locks and leases. Resend calls happen outside database transactions with a ten-second timeout.

## Status and recovery

My Tickets and the organizer ticket dashboard show Queued, Retry scheduled, Sent to email provider or Needs support. Sent means Resend accepted the request; it does not confirm inbox delivery. Bounce/delivery webhook tracking is separate future work. Customers can always retrieve their issued tickets from the signed-in page.

The worker encrypts the exact rendered email before its first attempt and preserves its payload and idempotency key for retries. It retries transient failures with exponential backoff, up to eight attempts. Uncertain sends older than twenty-three hours stop for operator review because Resend retains idempotency keys for twenty-four hours. Invalid requests and non-deliverable orders stop too. Raw provider error bodies and email contents are never logged.

For a blocked message, inspect lastErrorCode and the order/payment status using trusted database tooling; check Resend using the provider ID or idempotency key ticket-email:<outbox-id> before any manual resend. Do not blindly clear firstAttemptAt, delete the outbox entry or regenerate its key: an earlier uncertain request may have sent successfully. There is no browser resend button in this release. Retain TICKET_TOKEN_KEY while encrypted tickets or pending email snapshots exist.

Provider references: https://resend.com/docs/api-reference/emails/send-email and https://resend.com/docs/dashboard/emails/idempotency-keys.

For Vercel hosting and the protected HTTP scheduler endpoint, see [vercel-deployment.md](vercel-deployment.md).

## Scheduled batch update

The scheduled route now defaults to ten messages per invocation, capped by TICKET_EMAIL_BATCH_SIZE (1–25), and stops starting new messages after a cooperative 35-second budget. CLI calls still default to ten. Existing leases, encrypted snapshots, attempt limits and provider idempotency keys are retained. See vercel-deployment.md for daily/pro schedule configuration and backlog limitations.
