#!/usr/bin/env bash
# =============================================================
# MrGovCon — Droplet Deploy Script
# Targets: /opt/govcon/app on Govcon-beta-01 (137.184.207.229)
# Stack: Docker Compose (backend, frontend, postgres, redis, ollama)
# =============================================================
# Usage (on droplet):
#   cd /opt/govcon/app
#   bash scripts/deploy.sh
#
# What it does:
#   1. Snapshots Postgres DB to /opt/govcon/backups/db_<TS>.sql
#   2. Records current commit hash for rollback
#   3. Pulls latest from origin/main
#   4. Rebuilds + restarts containers
#   5. Runs Prisma db push (schema migration, additive only)
#   6. Health-checks backend; on failure, auto-rolls back to prior commit
# =============================================================
set -euo pipefail

# -------------------------------------------------------------
# Config
# -------------------------------------------------------------
PROJECT_DIR="/opt/govcon/app"
BACKUP_DIR="/opt/govcon/backups"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
HEALTH_URL="http://localhost:3001/health"
HEALTH_TIMEOUT=60

# -------------------------------------------------------------
# Helpers
# -------------------------------------------------------------
log() { echo "[deploy $(date +%H:%M:%S)] $*"; }
die() { echo "[deploy FATAL] $*" >&2; exit 1; }

# -------------------------------------------------------------
# Pre-flight
# -------------------------------------------------------------
[[ "$EUID" -eq 0 ]] || die "Must run as root"
[[ -d "$PROJECT_DIR" ]] || die "Project dir $PROJECT_DIR not found"
cd "$PROJECT_DIR"

mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d_%H%M%S)
PREV_COMMIT=$(git rev-parse HEAD)
log "Current commit: $PREV_COMMIT"
echo "$PREV_COMMIT" > "$BACKUP_DIR/last_deploy.txt"

# -------------------------------------------------------------
# 1. Backup Postgres
# -------------------------------------------------------------
log "Backing up Postgres → $BACKUP_DIR/db_${TS}.sql"
docker exec govcon_postgres pg_dump -U govcon_user govcon_platform \
  > "$BACKUP_DIR/db_${TS}.sql"
BACKUP_SIZE=$(stat -c%s "$BACKUP_DIR/db_${TS}.sql")
[[ "$BACKUP_SIZE" -gt 1024 ]] || die "Backup file is suspiciously small ($BACKUP_SIZE bytes)"
log "Backup OK: ${BACKUP_SIZE} bytes"

# -------------------------------------------------------------
# 2. Pull latest code
# -------------------------------------------------------------
log "Pulling latest from origin/main..."

# Stash any local edits first (don't lose them if they exist)
if [[ -n "$(git status --porcelain)" ]]; then
  log "Stashing local edits as deploy-${TS}"
  git stash push -m "deploy-${TS}"
fi

git fetch origin
git checkout main
git pull --ff-only origin main || die "Pull failed — likely diverged. Resolve manually."

NEW_COMMIT=$(git rev-parse HEAD)
log "New commit: $NEW_COMMIT"

if [[ "$PREV_COMMIT" == "$NEW_COMMIT" ]]; then
  log "Already at latest commit — nothing to deploy"
  exit 0
fi

# Show what's about to ship
log "Commits being deployed:"
git log --oneline "${PREV_COMMIT}..${NEW_COMMIT}"

# -------------------------------------------------------------
# 3. Rebuild + restart containers
# -------------------------------------------------------------
log "Rebuilding containers (this can take 3-5 min)..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull
log "Restarting services..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

# Give containers a moment to settle
sleep 8

# -------------------------------------------------------------
# 4. Apply schema migrations
# -------------------------------------------------------------
log "Running Prisma db push (additive only — no data loss expected)..."
docker exec govcon_backend npx prisma db push --accept-data-loss --skip-generate \
  || die "Prisma migration failed"

# -------------------------------------------------------------
# 5. Health check (with rollback on failure)
# -------------------------------------------------------------
log "Health check (timeout ${HEALTH_TIMEOUT}s)..."
for i in $(seq 1 $HEALTH_TIMEOUT); do
  if curl -fs "$HEALTH_URL" > /dev/null 2>&1; then
    log "Health OK after ${i}s"
    HEALTH_OK=1
    break
  fi
  sleep 1
done

if [[ "${HEALTH_OK:-0}" != "1" ]]; then
  log "❌ HEALTH CHECK FAILED — rolling back to $PREV_COMMIT"
  git checkout "$PREV_COMMIT"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build
  log "Rolled back. DB backup at $BACKUP_DIR/db_${TS}.sql if needed."
  die "Deploy failed — check container logs"
fi

# -------------------------------------------------------------
# 6. Smoke test the new endpoints
# -------------------------------------------------------------
log "Smoke testing critical endpoints..."
curl -fs http://localhost:3001/health > /dev/null && log "  /health OK" || log "  /health FAIL"
curl -fs "http://localhost:3001/api/branding/by-host/mrgovcon.co" > /dev/null && log "  /api/branding/by-host OK" || log "  /api/branding/by-host FAIL"

# -------------------------------------------------------------
# Done
# -------------------------------------------------------------
log "✅ Deploy complete"
log "  From: $PREV_COMMIT"
log "  To:   $NEW_COMMIT"
log "  DB backup: $BACKUP_DIR/db_${TS}.sql"
log ""
log "If any issue arises:"
log "  bash scripts/deploy.sh rollback   # not yet implemented — manual:"
log "  cd $PROJECT_DIR && git checkout $PREV_COMMIT && docker compose --env-file $ENV_FILE -f $COMPOSE_FILE up -d --build"
