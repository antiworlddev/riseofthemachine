# Install inventory screen update

Copy these paths into your existing project:

- src/server/merch-inventory.ts (new)
- src/server/auth.ts (updated login return destinations)
- src/app/api/admin/merch/inventory/ (new directory)
- src/app/admin/merch/inventory/ (new directory)
- src/app/merch/merch-orders.tsx (inventory navigation link)

Optional updated tests/docs are also included. Preserve your .env, prisma.config.ts, schema.prisma, package files and vercel.json. No database migration or new dependency is required. Run npm run typecheck and npm run build, then push/deploy as usual. Open /admin/merch, select Merch inventory, and sign in with your organizer account. Capacity is a total, not additional units.
