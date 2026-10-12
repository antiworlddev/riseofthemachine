# Vercel scheduling and deployment

## Current plan and schedules

The current deployment uses Vercel Pro. Run `node --import tsx scripts/setup-cron.ts pro` to configure all three jobs once per minute. Keep the existing Pro vercel.json when installing application updates. The daily profile below remains a Hobby-compatible fallback. Run `node --import tsx scripts/setup-cron.ts daily` from the project root to merge these jobs into your existing vercel.json:

| Endpoint | Daily schedule (UTC) | Work |
| --- | --- | --- |
| /api/jobs/ticket-emails | 0 8 * * * | Up to TICKET_EMAIL_BATCH_SIZE messages; default 10, max 25 |
| /api/jobs/ticket-expiry | 0 7 * * * | Up to 25 expired ticket reservations |
| /api/jobs/merch-expiry | 30 7 * * * | Up to 25 expired merch reservations |

Hobby allows only daily schedules and can invoke within the specified hour; Pro supports once-per-minute schedules. After upgrading, `node --import tsx scripts/setup-cron.ts pro` replaces the three managed schedules with `* * * * *`. Existing unrelated jobs and configuration are retained. Deploy after changing vercel.json to activate. Vercel documentation: https://vercel.com/docs/cron-jobs/usage-and-pricing.

Each handler declares maxDuration=60 and stops starting new work after a cooperative 35-second budget. In-progress work can exceed that budget; platform termination, a slow database or provider can interrupt an invocation. Expiry is atomic/idempotent and email delivery retains stable snapshots, provider idempotency keys and leases for safe recovery. Monitor counts/backlog; batching alone is not a ten-thousand-guest throughput plan. Daily runs can miss the email worker's 23-hour automatic retry window, so this remains a development setup. Failed/blocked messages require investigation, not blind reset of their provider keys.

## Environment and deployment

Keep server environment variables in Vercel, including DATABASE_URL, APP_ORIGIN, Google/OIDC settings, SESSION_KEY, Paystack, TICKET_TOKEN_KEY, event switches and Resend configuration. Preserve encryption keys for an existing database. Keep PAYSTACK_MODE, TICKET_EMAIL_MODE and ADMISSION_MODE=test during practice, and use a separate production database when switching to live. Disable Neon branch auto-delete.

APP_ORIGIN is the stable HTTPS deployment origin with no trailing slash. Google callback is APP_ORIGIN/api/auth/callback; Paystack webhook is APP_ORIGIN/api/paystack/webhook. Preview deployments should have separate databases/secrets or disabled email delivery. Build should regenerate Prisma Client before next build; deploy migrations separately when an update requires them. This update has no migration.

CRON_SECRET is server-only, at least 32 characters without whitespace. Native Vercel cron sends Authorization: Bearer <CRON_SECRET>. Browser cookies and URL query secrets cannot authorize jobs. Retain your existing secret; a new secret may be generated with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Never commit it or use NEXT_PUBLIC. Redeploy after changing environment variables. TICKET_EMAIL_BATCH_SIZE optionally controls the email cap (1–25; default 10).

An external scheduler can call the same three GET endpoints with that bearer header; configure its timeout for bounded batches and disable duplicate schedules when switching. Use exact HTTPS URLs, and a supported Vercel deployment-protection bypass only when required. No scheduler needs your database URL, Paystack secret or Resend key.

## Acceptance and monitoring

Missing/wrong bearer tokens return 401; missing/invalid CRON_SECRET returns 503. Authorized requests return no-store count responses, with zero counts for empty queues. A 200 response with blocked > 0 still needs support. Check Vercel cron logs, email queue status and reserved stock; enable operational alerts before real sales. Hosted deployment/cron acceptance must be verified after installing this update.
