# PROGRESS

Status as of 2026-11-20. **Nothing here is production-ready.** Production readiness requires Phase 11 and every
owner/external gate in spec §13, §18 and §19.

## Phase status

| # | Phase | Status | Notes |
|---|---|---|---|
| 0 | Foundation | **Done (dev acceptance), with one unverified item** | Monorepo, tooling, CI workflow, design tokens, RTL app shell, i18n, health checks. `docker compose up` **not yet executed**: Docker is not installed on the build machine (see "Unverified"). |
| 1 | Identity | **Done (dev acceptance)** | Registration, email verification, login, email OTP, sessions + revoke, TOTP MFA + recovery codes, progressive lockout, RBAC with seeded roles, admin users/roles UI, append-only hash-chained audit log. |
| 2 | Catalog, sections, scheduling, public pages | Next | — |
| 3–11 | — | Not started | — |

## Phase 0 acceptance

| Criterion | Evidence |
|---|---|
| Running shell in Arabic and English | `next build` + `next start`; Playwright `e2e/shell.spec.ts` (ar default + RTL, en LTR, redirect, no horizontal scroll) on desktop and 390 px |
| Health checks | API `/health`, `/ready` (DB + Redis), `/metrics` (bearer token); web `/healthz`; worker `/health`, `/ready` |
| Design tokens | `packages/ui/src/tokens.css` — single file, one-line colour changes |
| CI green | Workflow in `.github/workflows/ci.yml`; every step it runs passes locally. **Has not run on GitHub yet** (no remote). |
| `docker compose up` | **Unverified** — files written (`infra/compose/app`, `infra/compose/live`, `infra/docker/node.Dockerfile`) but not executed. |

## Phase 1 acceptance

| Criterion | Evidence |
|---|---|
| Every role can log in and sees only its menu | `admin.int.test.ts` → one test per seeded role (13) checks roles, exact permission set, MFA requirement, menu derivation; e2e checks trainee and instructor menus |
| Permission tests pass | `access-matrix.int.test.ts` is generated from route metadata: every non-public route → 401 anonymous; every permission route → 403 without the permission and not 401/403 with exactly that permission. Startup refuses any route without a declared policy. |
| Audit entries written | Asserted in auth/admin tests; DB trigger blocks UPDATE/DELETE/TRUNCATE; SHA-256 hash chain verified via `/audit/verify-chain` |
| Unified identity model verified | One `User` per person, roles as rows, stable UUIDs; staff MFA enforced by the global guard; `mfaPending` prevents half-authenticated portal access |

Test totals at this commit: shared 9, db 5, api unit 5 + integration 50, web unit 3, worker 3, Playwright 10 (5 × 2 viewports).

## Unverified / environment limitations (build machine)

- **Docker not installed** → images, Compose stacks, Caddy, PgBouncer, Redis, MinIO, ClamAV, Prometheus/Grafana have not been run.
  Dev/test use a project-local PostgreSQL 17 cluster (`scripts/dev-db.sh`, port 55432) and the in-process Redis fallback.
- **Redis not installed** → the Redis code paths (rate limiter, readiness ping) are implemented but exercised only in CI/Compose.
- **GitHub Actions not run** (no remote configured).
- Prisma blocks `migrate reset` when invoked by an AI agent; integration tests therefore use non-destructive `migrate deploy`
  and unique per-test data. CI uses a fresh service container per run.

## Next (Phase 2)

Program/ProgramVersion/Category, Section with capacity + instructor, recurring schedule → ClassSessions, coordinator UI,
SEO public program pages (ar/en, metadata, sitemap, JSON-LD), lead capture with unchecked consent, calendar + ICS export.

## TODO(HUMAN) — owner inputs (spec §13)

1. Official NELC/FutureX integration specification, applicability and credentials.
2. Card/mada payment gateway choice and keys; Tamara/Tabby only after business approval.
3. ZATCA e-invoicing scope, certified provider choice, credentials; seller VAT details.
4. Saudi SMS provider and sender name; SMTP credentials and sending domain (SPF/DKIM/DMARC).
5. Final brand colours and logo (defaults from spec §3 are in `packages/ui/src/tokens.css`).
6. Legal texts: privacy notice, terms, refund policy, retention periods (versions currently `draft-2026-11`).
7. Production domain names and server location/region.
8. Peak concurrent users, simultaneous rooms, participants per room, recording hours, upload volume, bandwidth.
9. Legal entity details, regulatory applicability matrix, program-by-program accreditation numbers (never auto-filled).
10. Ownership of canonical enrollment/attendance/grades/billing if an existing registration system stays in service.
11. Whether SIS-grade features or multi-tenant SaaS are in scope (excluded by default).
12. Recording policy, notices, retention and consents.
13. Whether this platform replaces or links to the existing MZN registration site.
14. **Object storage image**: MinIO changed its community image distribution in 2025 — confirm source/licence or pick another S3-compatible store.
15. **Container registry, deploy host and SSH credentials** for the manual-approval deploy job.
16. **Lawful purpose for national ID / date of birth**: fields exist encrypted in `Profile` but are not collected by any flow until a documented purpose is approved.

## Open questions

- Should trainees be offered SMS OTP once an SMS provider is chosen, or email OTP only?
- Session lifetime policy (defaults: 12 h absolute, 60 min idle) — confirm with security owner.
