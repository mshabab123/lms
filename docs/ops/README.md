# Operations runbooks

| Runbook | Status |
|---|---|
| [Deploy & rollback](deploy.md) | draft (unexecuted) |
| [Backup & restore](../security/backup-restore.md) | design only |
| [Key rotation](../security/key-rotation.md) | draft |
| [Incident response](../security/incident-response.md) | draft |
| Add a LiveKit node | Phase 4 — media host requirements are in `infra/compose/live/compose.yaml` |
| Migrate to OCI | Phase 11 — PostgreSQL → OCI PostgreSQL (pg_dump/pgBackRest restore), MinIO → OCI Object Storage (S3-compatible API, `rclone sync`), Compose → container instances/OKE. Conditional on residency assessment, service fit and cost. |
| Personal-data inventory & cross-border assessment | Phase 9 (spec §10) — no third-party trackers or analytics are enabled. |
