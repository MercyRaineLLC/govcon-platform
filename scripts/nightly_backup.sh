#!/usr/bin/env bash
# =============================================================
# MrGovCon — Nightly Postgres Backup (PROMPT §8.1 #2)
# =============================================================
# Runs from cron on the droplet. Snapshots the live Postgres
# database, gzip-compresses, drops to /opt/govcon/backups/, and
# rotates anything older than RETENTION_DAYS.
#
# Cron entry (install with `sudo crontab -e` as root):
#   0 3 * * * /opt/govcon/app/scripts/nightly_backup.sh >> /var/log/govcon-backup.log 2>&1
#
# Why 03:00 UTC: low-traffic window, well after BullMQ scheduled
# jobs (twice-daily portfolio scoring, watchlist digest) and
# before any morning user activity.
#
# Companion to scripts/deploy.sh which takes its own pre-deploy
# snapshot — these nightly backups cover the gap between deploys.
# =============================================================
set -euo pipefail

BACKUP_DIR="/opt/govcon/backups"
PROJECT_DIR="/opt/govcon/app"
CONTAINER="govcon_postgres"
RETENTION_DAYS=14

# -------------------------------------------------------------
# Load Postgres credentials from .env.prod. Cron doesn't inherit
# the operator's shell env, and the compose file's defaults
# (govcon_prod) don't match what's actually deployed (govcon_user
# per deploy.sh). Source the same file the backend container uses.
# -------------------------------------------------------------
ENV_FILE="${PROJECT_DIR}/.env.prod"
if [[ -r "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

DB_USER="${POSTGRES_USER:-govcon_user}"
DB_NAME="${POSTGRES_DB:-govcon_platform}"
TS=$(date +%Y%m%d_%H%M%S)
DEST="${BACKUP_DIR}/nightly_${TS}.sql.gz"

log() { echo "[backup $(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { echo "[backup FATAL] $*" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"

# -------------------------------------------------------------
# Verify Postgres container is up before attempting the dump.
# Cron mail traffic from a stale container would mask real failures.
# -------------------------------------------------------------
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  die "Container ${CONTAINER} not running — aborting backup"
fi

# -------------------------------------------------------------
# Dump → gzip → write atomically (.tmp first, rename on success).
# pg_dump's exit status propagates through the pipe via pipefail.
# -------------------------------------------------------------
log "Dumping ${DB_NAME} → ${DEST}"
TMP="${DEST}.tmp"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip -9 > "$TMP"

SIZE=$(stat -c%s "$TMP")
if [[ "$SIZE" -lt 1024 ]]; then
  rm -f "$TMP"
  die "Backup file is suspiciously small (${SIZE} bytes) — pg_dump likely failed"
fi

mv "$TMP" "$DEST"
log "Backup OK: $(numfmt --to=iec --suffix=B "$SIZE")"

# -------------------------------------------------------------
# Rotate: delete nightly backups older than RETENTION_DAYS.
# Pre-deploy snapshots (db_*.sql) are NOT touched — those are
# managed by deploy.sh and serve a different recovery purpose.
# -------------------------------------------------------------
DELETED=0
while IFS= read -r -d '' OLD; do
  rm -f "$OLD"
  DELETED=$((DELETED + 1))
done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'nightly_*.sql.gz' -mtime +${RETENTION_DAYS} -print0)

if [[ "$DELETED" -gt 0 ]]; then
  log "Rotated ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi

# -------------------------------------------------------------
# Quick health line so cron mail / log review is easy to scan.
# -------------------------------------------------------------
TOTAL=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'nightly_*.sql.gz' | wc -l)
DISK_USED=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
log "Done. ${TOTAL} nightly backup(s) on disk, ${DISK_USED} total in ${BACKUP_DIR}"
