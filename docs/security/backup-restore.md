# Backup and restore runbook

**Status: design only.** Design targets RPO 15 min / RTO 2 h are *not* achieved until a restore drill passes (Phase 11).

## Design
- PostgreSQL: pgBackRest with continuous WAL archiving (PITR) to off-server, encrypted, S3-compatible storage;
  weekly full, daily differential; retention per the approved schedule. (pgBackRest container/sidecar is added in Phase 11.)
- Object storage: independent bucket replication/backup (recordings, certificates, uploads).
- Secrets: kept in the owner's secret store, not in backups.

## Restore drill (to run before go-live)
1. Provision a clean host; `bash infra/...` rebuild (Phase 11 one-command script).
2. `pgbackrest restore --type=time --target=<timestamp>`; start Postgres; run `prisma migrate status`.
3. Start the stack; verify `/ready`, sign-in, audit chain (`/audit/verify-chain`), and reconcile financial totals.
4. Record achieved RPO/RTO in `PROGRESS.md`.
