# Merch catalogue and order tools

## Update and migrate

Merge this release while preserving your environment files, prisma.config.ts and Vercel Pro vercel.json. Run against your intended database:

```sh
npm run db:deploy
npm run db:generate
npm run typecheck
```

Restart locally, then deploy. The migration adds product revisions/images, variant enabled flags and a chronological order index. Existing variants default to enabled, and existing stock, products, reservations and paid orders are preserved.

## Catalogue

Open /admin → Merch catalogue (/admin/merch/catalog). Edit the existing dummy tees/caps/satchel, or add a product. Set name, description, product type, naira price, image link and variant labels/availability. Enter a reason and confirm before saving. New products start with sales closed; new variants have zero capacity. Use Merch inventory to set capacity and open product sales after preparing the details. Disabling a variant overrides its stock availability for new quotes and purchases; inventory shows the disabled status without removing historical stock counts.

Use HTTPS image URLs from your image host, or files you have already added under public/images, public/assets or public/merch via their /images/, /assets/ or /merch/ URL paths. Upload/file storage is not part of this slice. Links must not contain embedded credentials. Leave the image blank to use existing placeholder artwork. The buyer shop displays the product description and configured image. Verify image availability on the hosted site before opening sales.

Existing variant IDs cannot be removed from edits, and labels must be distinct ignoring case. Disable unwanted sizes instead of deleting them. Label swaps are supported. New products get an internal unique slug; slugs are not editable. Prices allow two decimal places in naira, stored as integer minor units; the maximum is ₦1,000,000 per unit. Existing captured order names, labels and prices remain unchanged. Stale price quotes are rejected before checkout with stock rollback. Existing captured reservations can retry and complete payment after a product/variant closes. Product and stock settings serialize under matching product/variant locks, and stock edits advance the catalogue revision so stale catalogue screens must reload.

Changes record organizer identity, reason, before/after product name and price, and variant labels/enabled snapshots. The audit history UI shows only permitted fields.

## Orders

Open /admin → Merch orders. Test/live selection remains explicit. Search partial buyer name or exact buyer email, phone, order UUID or payment reference. Combine payment status/reconciliation, pickup/delivery, fulfilment status and created date range. Date inputs use device local time and are sent as ISO instants. Orders are newest first with timestamp/ID keyset pagination, 50 at a time. Summary totals cover all matching orders, not just the visible page. The paid summary includes PAID orders with a verified payment in the selected mode and no payment-review hold; it includes captured shipping and is not a net revenue/accounting report.

Existing fulfilment transitions and revision/payment/refund guards continue to apply. Filtered orders can still be prepared, dispatched or completed using the existing confirmation flow.

## CSV exports

Export filtered CSV uses the active filters across all matching orders, ignoring the visible page cursor. It supports up to 500 orders and returns an error requesting narrower filters if there are more; no silent truncation. It includes order/item snapshots, buyer contact and delivery address, payment/refund/fulfilment states, tracking/delivery terms, unit price, shipping fee and order total. It excludes buyer auth subjects, admission tokens, encrypted data and payment authorization links.

Each item has its own row. Order total and shipping fee repeat for each item row: do not sum those columns across multi-item rows without deduplicating by order ID. Numbers are NGN decimal values. Spreadsheet formula prefixes (including phones beginning + and malicious user-entered values) are neutralized with an apostrophe, and quotes/commas/newlines are escaped. Excel/Sheets may show that protective apostrophe depending on import settings. Buyer contact/address data should go only to the operational pickup/delivery team. This export is organizer-only, authenticated and no-store; it does not grant staff accounts or send files to anyone.

## Acceptance

Run native PostgreSQL CI and check hosted two-account permissions, stale/concurrent edits, image links, old/new prices, variant availability, paid/reserved/refund filters, pickup/delivery fulfilment and CSV import. All local provider interactions use mocks; no actual payment, refund, message or delivery booking is needed for this release's tests.
