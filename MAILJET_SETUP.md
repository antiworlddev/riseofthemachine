# Mailjet setup

The website saves signups centrally, then synchronizes them to your Mailjet account through the existing `/api/jobs/ticket-emails` cron. Campaigns are composed, personalized and sent in Mailjet. This integration never sends or schedules campaigns automatically. Ticket and transactional emails continue using the existing Resend setup.

## 1. Prepare Mailjet and environment variables

Use two distinct Mailjet contact lists:

- **RISE OF THE MACHINE waitlist** — event launch information.
- **ODUMODUBLVCK newsletter** — explicit newsletter opt-ins.

You can use your existing newsletter list. Keep the waitlist separate; a waitlist-only signup does not touch an existing Mailjet newsletter subscription. Copy each list's numeric ID from Mailjet.

Add these server-only variables to Vercel **Production**, and your private `.env.production.local` for the setup commands:

```env
MAILJET_ENABLED=true
MAILJET_API_KEY=<Mailjet API key>
MAILJET_SECRET_KEY=<Mailjet secret key>
MAILJET_WAITLIST_LIST_ID=<waitlist list ID>
MAILJET_NEWSLETTER_LIST_ID=<newsletter list ID>
MAILJET_WEBHOOK_SECRET=<new 64-character hex secret>
```

Keep `SUBSCRIBER_TOKEN_KEY`, `APP_ORIGIN=https://riseofthemachine.live` and your existing `CRON_SECRET`. No keys belong in browser code, NEXT_PUBLIC variables, Git or chat. Generate MAILJET_WEBHOOK_SECRET locally with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep Mailjet disabled in local/Preview environments, or use separate Mailjet credentials/lists there. Do not synchronize disposable test subscribers into your real audience.

## 2. Apply migrations and prepare personalization

This update adds `20261018010000_mailjet_sync`, after the prelaunch subscriber migration. Apply all pending migrations:

```bash
node --env-file=.env.production.local node_modules/prisma/build/index.js migrate deploy
```

Then run:

```bash
node --env-file=.env.production.local --import tsx scripts/setup-mailjet.ts
```

This verifies the two list IDs and creates any missing static string contact properties `rotm_first_name` and `rotm_unsubscribe_url`. It does not import contacts or send emails. If a property already exists with a different type, fix it in Mailjet before proceeding.

In the Mailjet campaign editor, insert `rotm_first_name` through its personalization controls, with a fallback such as “fam”. Include Mailjet's native unsubscribe link in every campaign; you may additionally link `rotm_unsubscribe_url` to the website's preference page. Keep sender-domain verification and your sender/reply-to settings configured in Mailjet.

## 3. Configure the authenticated webhook

In Mailjet's **Event Tracking**, configure **unsub**, **spam** and **bounce** events to POST to:

```text
https://mailjet:YOUR_MAILJET_WEBHOOK_SECRET@riseofthemachine.live/api/mailjet/webhook
```

Replace the placeholder with the same generated MAILJET_WEBHOOK_SECRET. `mailjet` is the Basic-auth username. Use HTTPS and single-event delivery (Version 1); bounded JSON arrays of up to 50 events are also supported. Avoid pasting the authenticated URL into logs, public docs or chat.

Webhook authentication is checked before processing its body or connecting to the database. Duplicate events are ignored. Unsubscribe events affect only the configured list; spam complaints and hard bounces suppress both website lists. Soft bounces do not unsubscribe someone. A later website signup never clears a complaint/hard-bounce suppression.

## 4. Deploy and verify

Redeploy Vercel with these variables. Your existing Pro cron for `/api/jobs/ticket-emails` also runs Mailjet sync; no additional cron is required. If you need to restore managed schedules without deleting other settings:

```bash
node --import tsx scripts/setup-cron.ts pro
```

Commit its resulting `vercel.json` and deploy.

For an immediate bounded sync, run:

```bash
node --env-file=.env.production.local --import tsx scripts/sync-mailjet.ts
```

This processes up to 10 due subscribers. Existing prelaunch signups are pending automatically after migration; the scheduled job drains the rest. `/admin/subscribers` shows pending/synced/error/suppressed states, with an audited retry button for failed entries.

Test using an address you control:

1. Join only the waitlist; confirm it appears on the Mailjet waitlist and is not newly added to the newsletter.
2. Join the newsletter with the same email; confirm the same Mailjet contact has the first-name property and both subscriptions.
3. Unsubscribe on the website; after sync, confirm the corresponding Mailjet subscription is unsubscribed.
4. Use Mailjet's native unsubscribe link in a test campaign you choose to send; confirm the webhook updates the website record.

## Opt-outs and operations

Sync uses `addnoforce`, which preserves existing Mailjet opt-outs, even after retries or ambiguous timeouts. A website signup alone does not forcibly reactivate an address already unsubscribed in Mailjet; the sync reads back the provider state and records that opt-out locally. Use Mailjet's own consent/resubscription process if a former subscriber wants to return. The app never clears global exclusions or provider complaint status.

The website records consent immediately even if Mailjet is unavailable. Retries use persistent state, exclusive leases and bounded backoff, and process the latest preferences. Check pending/errors before sending a campaign, especially after changing credentials or fixing a list/property configuration. A sync marked complete confirms the provider subscription readback; it does not mean an email was sent.

Do not rename/change list IDs to migrate audiences without a separate migration plan: old list memberships and unsubscribe events belong to their original lists. This integration does not import historical Mailjet subscribers into the app or delete existing Mailjet contacts.
