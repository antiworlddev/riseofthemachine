# Designer implementation and scheduler update

The supplied rise-of-the-machine.html is the visual reference. Its concert photograph, Anton/Inter typefaces, #0A0A0A background, #FF3B1F accent, rounded cards, pill controls and responsive hero are applied to the application. Fonts are served locally, with their OFL licenses in public/fonts. No external font fetch is required in production or at build time.

The landing page contains real ticket availability/checkout and table enquiry links. KALA links to the existing verified Google sign-in and roster workflow; the reference's unconnected email/team inputs are replaced by the working registration flow. Merch links to the existing shop. All account, organizer and scanner pages share the tokens, form controls and panel styling. Inventory becomes stacked stock rows on small screens. Drafts, validation, closed sales, sold-out stock, pending payments, organizer feedback and reconciliation notices remain functional states.

## Install

Copy src/ and public/ from this update into the current project. Copy scripts/setup-cron.ts and the updated tests/docs. Keep your existing .env, prisma.config.ts, schema.prisma, package files and vercel.json. There is no migration or dependency change.

Configure your current Hobby-compatible daily schedules by running this from the project root:

```sh
node --import tsx scripts/setup-cron.ts daily
npm run typecheck
npm run build
```

The cron script updates only the three managed paths in your local vercel.json; unrelated settings/jobs are retained. Review the file, then commit and push/deploy. Existing CRON_SECRET, Resend settings and verified sender remain in use. TICKET_EMAIL_BATCH_SIZE is optional; default 10, allowed 1–25. Set it in Vercel only if adjusting the cap, then redeploy.

After a Pro upgrade, explicitly run `node --import tsx scripts/setup-cron.ts pro` and redeploy to switch those jobs to once per minute. Do not use the pro option on Hobby. Daily scheduling is for development; email retries can require intervention because the safe provider retry window is shorter than a day. A batch cap is not a production throughput guarantee.

## Acceptance

Check the landing page and tickets, KALA, merch, account orders, staff scanner and organizer pages on your phone and desktop. Existing Google callback URLs and Paystack webhook URL are unchanged. The reference photo is included; merch artwork and album details remain placeholders until supplied. Inspect Vercel cron execution/logs after deploying: ticket-expiry and merch-expiry return expired counts; ticket-emails returns sent/retrying/blocked counts. Empty queues return zero. No hosted schedule or provider send was invoked from this workspace.
