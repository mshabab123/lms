# MZN Unified Learning Platform — منصة مزن للتعلم

Modular education & training operations platform for MZN Training Company. Build specification:
[MZN_Unified_Learning_Platform_Codex_Spec_.md](MZN_Unified_Learning_Platform_Codex_Spec_.md). Status: [PROGRESS.md](PROGRESS.md)
(Phases 0–1 complete for development; **not production-ready**).

## Layout

```text
apps/web      Next.js portal (Arabic default/RTL, English)       :3000
apps/api      NestJS modular monolith, REST + OpenAPI            :4000  (/api/v1/docs in non-production)
apps/worker   scheduled jobs (advisory-locked)                   :4100
packages/shared  permissions, navigation, state machines, Zod schemas
packages/db      Prisma schema/migrations, field crypto, seed
packages/ui      design tokens (tokens.css) + UI primitives
infra/           Docker, Compose (app + separate LiveKit host), Caddy, Prometheus
docs/            decisions, ADRs, domain ownership, workflows, integrations, data dictionary, security, ops
```

## Local development (no Docker required)

Requirements: Node 22, pnpm 10, PostgreSQL 17 binaries.

```bash
pnpm install
cp .env.example .env          # then set APP_ENCRYPTION_KEY, SESSION_SECRET (see comments), SEED_DEV_* for dev users
cp .env packages/db/.env       # Prisma CLI reads it from the package directory
pnpm devdb:start               # project-local Postgres on 127.0.0.1:55432 (dbs: mzn, mzn_test)
pnpm build
pnpm db:deploy && pnpm db:seed
pnpm --filter @mzn/api start & pnpm --filter @mzn/web start
```

With `SEED_DEV_USERS=true` the seed creates one account per role (`<role.key with dots>@mzn.test`, e.g.
`system.admin@mzn.test`) using `SEED_DEV_PASSWORD`; staff accounts share the TOTP secret `SEED_DEV_TOTP_SECRET`.
Mock emails are readable at `GET /api/v1/dev/mailbox/latest?to=<email>` (development/test only).

## Quality gates

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test   # all packages
pnpm test:integration                                            # API against DATABASE_URL_TEST (real Postgres)
pnpm test:e2e                                                    # Playwright, desktop + 390 px
node scripts/gen-access-matrix.cjs                               # regenerate docs/security/access-control-matrix.md
```
