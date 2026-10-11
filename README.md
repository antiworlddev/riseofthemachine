# RISE OF THE MACHINE — Phase 1 application

Next.js App Router + TypeScript + PostgreSQL/Prisma. Contains the database foundation, hosted OIDC sign-in adapter and free KALA GAMES team/roster registration API with a temporary responsive interface.

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

Registration stays closed by default. Seed creates missing events and disabled competitions only; configure approved team choices and roster rules before opening it. No credentials, paid checkout or production deployment is included.

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

Use Node 22. Prisma 6.19.0 remains deliberately pinned with reviewed SQL migrations; do not run an unpinned latest CLI. Keep all three migration directories: they include integrity triggers, organizer team catalog and persistent account quotas. Do not use db push instead of the migrations.

Read [application setup and API](docs/application.md), [ticketing transaction design](docs/architecture.md) and [validation](docs/validation.md). The GitHub Actions workflow runs checks with a native PostgreSQL service once this package is placed at the repository root. The supplied ZIP is a portable project; no remote repository was provided.
