# Prelaunch verification — 18 October 2026

- Typecheck and optimized Next.js production build passed.
- 108 unit/database-invariant tests passed.
- 149 integration tests passed against an isolated PGlite PostgreSQL engine through the PostgreSQL socket adapter. The production Neon database was not touched. Native PostgreSQL CI remains the production-engine check.
- Browser checks passed at 320, 390, 768 and 1440 CSS pixels without horizontal overflow.
- Browser form submissions used a disposable database: waitlist-only signup, newsletter opt-in with the same email, one shared subscriber, authenticated unsubscribe link and persisted opt-outs.
- Verified GET of an unsubscribe link does not change preferences; explicit confirmation does.
- Verified modal first-field focus, Escape close and trigger-focus restoration.
- Verified ticket, merch and KALA page redirects; direct checkout/quote/team API denial; organizer subscriber authentication; invalid-filter response; supporting account, admin, privacy and unsubscribe pages.
- Existing order access, payment verification/webhooks and jobs remain outside the prelaunch gate.
- No real payment, outbound fan email, production migration or deployment was performed.

Mailjet audience synchronization is included and tested with mocked provider responses: distinct lists, explicit newsletter consent, first-name properties, subscription readback, protected webhooks, duplicate events, stale events, spam/hard-bounce suppression, durable retries, in-flight preference changes and audited organizer retries. No real Mailjet account was accessed.

Campaign sending stays in Mailjet. See MAILJET_SETUP.md and PRELAUNCH_DEPLOYMENT.md for activation and operation.
