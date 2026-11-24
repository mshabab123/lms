-- Defence in depth for the append-only audit log: besides the blocking trigger, the
-- runtime role (created by infra/compose/app/postgres/init-roles.sh) loses the
-- privilege to UPDATE/DELETE/TRUNCATE it. No-op where the role does not exist (local dev).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mzn_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM mzn_app;
  END IF;
END
$$;
