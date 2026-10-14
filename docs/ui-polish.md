# UI and UX polish

This release refines the existing black/red designer direction with a clearer display-versus-task typography hierarchy, consistent panel/field spacing, readable supporting text, and responsive layouts. No database migration or environment change is required.

## Customer journeys

Ticket and table choices sit together, with a booking summary beside them on desktop and after them on mobile. Choosing a category scrolls to the correct booking step and focuses either sign-in or the buyer name. A non-sensitive category choice is remembered in the current tab for 30 minutes, including across sign-in. No price, consent, identity or payment authority is restored from browser storage. Current server availability/prices and existing consent/payment guards remain authoritative. Changing a category in the select does not steal keyboard focus. Unavailable choices explain why checkout cannot proceed.

Merch uses a product grid and separate bag/checkout column on desktop. Tablet gets two product columns and phone gets one. The default size chooses the first currently available variant. Mobile has a bag shortcut after adding goods, hidden when the bag or checkout is already visible. Size choices, cart persistence, quote expiry/consent and payment request structures retain the existing server guards.

Order empty states explain the next action. Public navigation identifies the current section. Supporting links are visually distinct from body copy, status/filter labels use readable words while their submitted enum values remain unchanged, and form controls retain 16px text for mobile zoom behavior.

## Organizer journeys

A shared scrollable organizer navigation replaces repeated cross-section link lists on roster review, ticket operations and merch orders. The current section is identified and brought into view in the tab strip. The control room's nested groups no longer inherit full landing-page section padding. Tool headings are calmer than event headings, with consistent card heights, spacing and quieter secondary text.

Catalogue editors are collapsed by default: product name, price and sale status remain visible. Open only the product to edit. Existing product variants/history safeguards remain intact. Native disclosure controls support keyboard operation.

Sign-in now recognizes staff, audit, email and catalogue return paths, in addition to the existing known paths. External, protocol-relative, unlisted and query-containing return paths still fall back to KALA GAMES; this is not an open redirect.

## Validation and rollout

The browser pass checks twelve customer/organizer routes at 320, 390, 768 and 1440px, plus table choice/sign-in focus and persistence, consent gating and payload, bag navigation, catalogue disclosures, active navigation and keyboard select focus. Browser/provider APIs are mocked. Screenshots are for internal QA only and are not bundled.

Merge changed source/styles while preserving your environment files, prisma.config.ts and Pro vercel.json. Run npm run typecheck and restart or redeploy. No schema migration is added by this release. Hosted iPhone/Safari camera, real sign-in roundtrip, real product imagery and final event/support/policy content remain launch acceptance items.
