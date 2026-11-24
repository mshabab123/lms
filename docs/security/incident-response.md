# Incident response runbook (draft)

Owner: Compliance and Security Officer. **TODO(HUMAN):** confirm contacts, regulator notification duties (PDPL) and
deadlines with legal counsel; the breach register with deadline tracking is built in Phase 9.

1. **Detect & triage** — alert, user report or log anomaly. Record time of awareness. Assign an incident lead.
2. **Contain** — revoke affected sessions (`POST /admin/users/:id/status` disable, or SQL `UPDATE "Session" SET "revokedAt"=now()`
   for broad compromise); rotate exposed keys (`docs/security/key-rotation.md`); block IPs at Caddy if needed.
3. **Preserve evidence** — export audit log for the window (`GET /audit/export`), keep container logs, do not delete data.
4. **Assess** — what personal data, how many subjects, which systems; check audit hash chain (`/audit/verify-chain`).
5. **Notify** — per the legal assessment and the deadlines recorded in the breach register.
6. **Recover** — restore from backup if integrity is in doubt (`docs/ops/restore.md`); reconcile financial totals.
7. **Review** — post-incident report, update threat model and controls.
