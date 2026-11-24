#!/usr/bin/env bash
# Project-local PostgreSQL cluster for development and integration tests when
# Docker is not available. Data lives in .local/pgdata (gitignored), port 55432.
# Usage: bash scripts/dev-db.sh start|stop|status|reset
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.local/pgdata"
PORT="${DEV_PG_PORT:-55432}"
USER_NAME=mzn
PASS="${DEV_PG_PASSWORD:-mzn_dev_only}"
PGBIN="${PGBIN:-}"
if [ -z "$PGBIN" ]; then
  if command -v pg_ctl >/dev/null 2>&1; then PGBIN="$(dirname "$(command -v pg_ctl)")";
  elif [ -d "/c/Program Files/PostgreSQL/17/bin" ]; then PGBIN="/c/Program Files/PostgreSQL/17/bin";
  else echo "PostgreSQL binaries not found; set PGBIN" >&2; exit 1; fi
fi
init() {
  mkdir -p "$ROOT/.local"
  local pw="$ROOT/.local/pwfile"; printf '%s' "$PASS" > "$pw"
  "$PGBIN/initdb" -D "$DATA" -U "$USER_NAME" --pwfile="$pw" --auth=scram-sha-256 -E UTF8 --locale=C >/dev/null
  rm -f "$pw"
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "port = $PORT"
    echo "max_connections = 200"
  } >> "$DATA/postgresql.conf"
}
case "${1:-start}" in
  start)
    [ -f "$DATA/PG_VERSION" ] || init
    if "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then echo "already running on $PORT"; exit 0; fi
    "$PGBIN/pg_ctl" -D "$DATA" -l "$ROOT/.local/pg.log" -w start >/dev/null
    for db in mzn mzn_test; do
      PGPASSWORD="$PASS" "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
        || PGPASSWORD="$PASS" "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" -d postgres -c "CREATE DATABASE $db" >/dev/null
    done
    echo "dev postgres running: postgresql://$USER_NAME:***@127.0.0.1:$PORT/mzn (test db: mzn_test)";;
  stop) "$PGBIN/pg_ctl" -D "$DATA" -w stop ;;
  status) "$PGBIN/pg_ctl" -D "$DATA" status ;;
  reset) "$PGBIN/pg_ctl" -D "$DATA" -w stop 2>/dev/null || true; rm -rf "$DATA"; "$0" start ;;
  *) echo "usage: $0 start|stop|status|reset" >&2; exit 2 ;;
esac
