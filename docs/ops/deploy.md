# Deploy, rollback and environments

Environments (`development`, `staging`, `production`) are selected only by environment variables (`APP_ENV`).
Staging/production refuse to boot without Redis, secure cookies and an `https` public URL; production refuses mock email.

## Pilot deploy on one host (application stack)
```bash
cp .env.example .env   # fill every value; generate keys as documented in the file
# production values also need: POSTGRES_SUPERUSER_PASSWORD, POSTGRES_OWNER_PASSWORD, POSTGRES_APP_PASSWORD,
# REDIS_PASSWORD, MINIO_ROOT_USER/PASSWORD, GRAFANA_ADMIN_PASSWORD, SITE_ADDRESS, COOKIE_SECURE=true
docker compose -f infra/compose/app/compose.yaml --env-file .env build
docker compose -f infra/compose/app/compose.yaml --env-file .env up -d postgres pgbouncer redis
docker compose -f infra/compose/app/compose.yaml --env-file .env --profile ops run --rm migrate
docker compose -f infra/compose/app/compose.yaml --env-file .env up -d
```
Seed roles once: `pnpm db:seed` against the owner connection (dev users are never created when `NODE_ENV=production`).

Monitoring: `--profile monitoring`; reach Grafana with `ssh -L 3001:grafana:3000 <host>` (not published).

## Rollback
1. `IMAGE_TAG=<previous> docker compose ... up -d api web worker`.
2. Migrations are forward-only; a rollback that needs schema changes ships a new forward migration. Destructive
   migrations require a backup taken immediately before deploy.

## CI deploy job
`.github/workflows/ci.yml` → `deploy` runs only via manual dispatch on `main` behind the `production` environment
(required reviewers). Registry and host are TODO(HUMAN) #15.

**Unverified:** these commands have not been executed on the build machine (no Docker).
