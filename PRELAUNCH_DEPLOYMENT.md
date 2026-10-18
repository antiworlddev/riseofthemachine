# Prelaunch waitlist and ODUMODUBLVCK newsletter

This update preserves the ticketing, merch, KALA and organizer implementation. The public holding page uses the supplied artwork and corrected Kalacious logo. No live deployment, customer email or production data changes were performed while preparing it.

## Install and migrate

Merge the update into your existing repository. Keep your `.env*`, custom `prisma.config.ts` and existing Pro `vercel.json`. Do not downgrade Prisma or replace working auth/payment credentials.

```bash
npm ci
npm run db:generate
```

Apply the migration to dev first using its database URL. For your already-configured production env file:

```bash
node --env-file=.env.production.local node_modules/prisma/build/index.js migrate status
node --env-file=.env.production.local node_modules/prisma/build/index.js migrate deploy
```

The new migration only adds Subscriber and SubscriberConsent tables. Do not reset production or run the seed just for this update.

## Vercel variables

Add to Production (and Preview if you want the holding page there):

```env
SITE_MODE=prelaunch
SUBSCRIBER_TOKEN_KEY=<a stable 64-character hexadecimal key>
```

Generate the key locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep that value stable: changing it invalidates already-exported unsubscribe links. Set `APP_ORIGIN=https://riseofthemachine.live` and keep the canonical domain redirect in place. Signups do not require an auth provider session, but staff tools still use the existing auth configuration. Redeploy after changing environment variables.

Keep `TICKET_SALES_ENABLED=false`, `MERCH_SALES_ENABLED=false` and `KALA_REGISTRATION_ENABLED=false` during prelaunch too. SITE_MODE provides an additional independent gate. The default is prelaunch; only the exact value `live` reveals the full site. For local development of the full application, set SITE_MODE=live in your local .env while leaving Vercel Production at prelaunch.

## What is available

- `/`: artwork-led hero, waitlist dialog and newsletter section.
- `/admin`: existing organizer tools, with a Subscribers link.
- `/admin/subscribers`: active list counts, 50-at-a-time browsing, consent status and CSV export (maximum 5,000 records per export).
- `/account`: verified profile setup for staff invitations while KALA is hidden. Bootstrap the first organizer using the existing `scripts/grant-admin.ts` command.
- `/privacy`: signup data-use explanation. Confirm it matches your team's actual communications practices before sharing the link.
- Existing authenticated ticket/merch order pages, verification callbacks, Paystack webhook, cron and scanning endpoints remain available for existing transactions. These are not advertised in the holding page.
- New checkout, shipping quotes, public catalogue/fixtures and KALA team/roster routes are blocked. An organizer opening inventory cannot bypass SITE_MODE.

The waitlist checkbox for OD's newsletter is optional and unchecked. Standalone newsletter signup requires explicit consent. Names and email addresses are stored centrally, with normalized email uniqueness and timestamped consent history. A waitlist-only submission never silently reactivates a newsletter opt-out. Explicit rejoining restores only the list requested.

## Mailing lists

Mailjet integration is included. Follow MAILJET_SETUP.md to configure the two audience lists, personalization properties and authenticated unsubscribe webhooks. Signups and website opt-outs are queued durably for the existing scheduled email job. Campaign creation/sending stays in Mailjet; no fan campaign is automatically sent by this website.

CSV export remains available as an organizer fallback. Export **Active newsletter** for personal fan mails, or **Active waitlist** for event-launch updates. Export fresh before every manual send, exclude suppressed/unsubscribed contacts and include unsubscribe links. Prefer the synchronized Mailjet lists once configured.

Subscriber exports contain personal data; keep them within your authorized organizer team. Exports are recorded in the audit log. No public signup response reveals whether an address already existed. The forms have a honeypot, bounded payloads and database-backed IP/email rate limits. On Vercel the overwritten `x-vercel-forwarded-for` identifies the IP; other hosts share a conservative fallback bucket and need a trusted proxy configuration before use at scale.

## Before sharing

1. Apply the new migration and deploy with SITE_MODE=prelaunch.
2. Submit a waitlist entry without the newsletter checkbox and check its status in Subscribers.
3. Opt the same email into the newsletter and confirm one fan record with both lists.
4. Export a list, open its unsubscribe URL and confirm the status changes.
5. Visit `/tickets`, `/merch` and `/kala-games` directly: each should return to the landing page.
6. Check the page and waitlist form on a physical phone.

## Full launch later

Set SITE_MODE=live and redeploy only when the launch is confirmed. Then enable the existing ticket/merch/registration environment switches and organizer settings as appropriate. Those business switches still apply independently. Subscriber records are retained. No timer or guessed launch date automatically opens sales.
