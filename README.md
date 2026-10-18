> **Prelaunch + Mailjet update:** Start with [PRELAUNCH_DEPLOYMENT.md](PRELAUNCH_DEPLOYMENT.md) and [MAILJET_SETUP.md](MAILJET_SETUP.md). Keep your existing production environment and Pro cron configuration.

# RISE OF THE MACHINE — Phase 1 application

Next.js App Router + TypeScript + PostgreSQL/Prisma. Contains the database foundation, hosted OIDC sign-in adapter and free KALA GAMES registration/review/settings, plus concert ticket checkout and verified Paystack ticket issuance with a temporary responsive interface.

## Start locally

```sh
npm ci
cp .env.example .env
# Configure your development database and hosted identity provider.
docker compose up -d
npm run db:deploy
npm run db:seed
npm run dev
```

Registration stays closed by default. Seed creates missing events and disabled competitions only; configure approved team choices and roster rules before opening it. No credentials or production deployment is included. Ticket checkout defaults to closed until explicitly configured.

## Checks

```sh
npm run db:validate
npm run db:generate
npm run typecheck
npm test
# Against a disposable PostgreSQL database:
TEST_DATABASE_URL=postgresql://rotm:local_only@localhost:5432/rotm npm run test:integration
npm run build
```

Use Node 22. Prisma 6.19.0 remains deliberately pinned with reviewed SQL migrations; do not run an unpinned latest CLI. Keep all migration directories: they include integrity triggers, organizer team catalog and persistent account quotas. Do not use db push instead of the migrations.

Read [organizer ticket operations](docs/ticket-operations.md), [staff check-in](docs/check-in.md), [concert ticketing setup](docs/ticketing.md), [application setup and API](docs/application.md), [ticketing transaction design](docs/architecture.md) and [validation](docs/validation.md). The GitHub Actions workflow runs checks with a native PostgreSQL service once this package is placed at the repository root. The supplied ZIP is a portable project; no remote repository was provided.

Ticket QR email setup and worker scheduling: [docs/ticket-emails.md](docs/ticket-emails.md).

Vercel deployment and scheduled ticket emails: [docs/vercel-deployment.md](docs/vercel-deployment.md).

Merch catalogue, pickup/delivery checkout and fulfilment: [docs/merch.md](docs/merch.md).

Table bookings and VIP parking: see [setup and acceptance](docs/tables-parking.md). Categories are Engines (₦3m), Autobots (₦5m), and Machineries (₦10m).

KALA additional sports and verified representative transfers: see [setup and acceptance](docs/kala-team-expansion.md). Eligibility declarations/review are included; initial tournament operations are included.

Central organizer hub: `/admin`. See [admin navigation and eligibility setup](docs/admin-eligibility.md).

KALA draw, fixture and score operations: see [tournament setup and acceptance](docs/kala-tournaments.md). Public fixtures are at `/kala-games/fixtures`.
