# ADR 0004 — Append-only, hash-chained audit log

- Status: accepted (2026-11-20)

## Decision
- `AuditLog` rows are written in the same transaction as the change they describe (`AuditService.record(entry, tx)`).
- PostgreSQL triggers reject UPDATE, DELETE and TRUNCATE for every role; a BEFORE INSERT trigger links each row to the
  previous one with SHA-256 (`prevHash`, `hash`) under a transaction advisory lock. In Compose, the runtime DB role also
  lacks UPDATE/DELETE/TRUNCATE privileges on the table.
- `changes` is minimized: keys matching password/secret/token/national/iqama/dob/otp/recovery/card are redacted;
  long strings truncated. Actor, roles, request id and IP are recorded.
- `GET /audit/verify-chain` checks link consistency; export is permission-gated and itself audited.

## Consequences
- Retention purges require a documented privileged procedure (disable trigger in a maintenance window, export first,
  record the purge) — to be specified with the retention schedule in Phase 9.
- Chain verification detects deletion/reordering via link checks; full recomputation of row hashes is a planned
  offline tool (Phase 11).
