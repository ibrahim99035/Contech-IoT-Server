#!/usr/bin/env bash
#
# Consistent MongoDB backup for the Compose stack.
#
# Streams a gzip'd mongodump archive straight out of the running mongo
# container into ./mongodb/backups, prunes old archives, and optionally copies
# the result offsite with rclone when BACKUP_REMOTE is set.
#
# Configuration (env, falling back to ./.env):
#   MONGO_ROOT_USERNAME / MONGO_ROOT_PASSWORD  credentials (default user admin)
#   BACKUP_DB          database to dump            (default: contech)
#   BACKUP_DIR         output directory            (default: mongodb/backups)
#   BACKUP_KEEP        number of archives to keep   (default: 14)
#   BACKUP_REMOTE      rclone target, e.g. s3:bucket/contech (optional)

set -euo pipefail

cd "$(dirname "$0")/.."

get_env() {
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -n1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

CONTAINER="${MONGO_CONTAINER:-contech-mongodb}"
DB="${BACKUP_DB:-contech}"
BACKUP_DIR="${BACKUP_DIR:-mongodb/backups}"
KEEP="${BACKUP_KEEP:-14}"

USER="${MONGO_ROOT_USERNAME:-$(get_env MONGO_ROOT_USERNAME)}"
USER="${USER:-admin}"
PASS="${MONGO_ROOT_PASSWORD:-$(get_env MONGO_ROOT_PASSWORD)}"
pass_present="${PASS:-}"

if [ -z "$pass_present" ]; then
  echo "[backup] ERROR: MONGO_ROOT_PASSWORD is not set (env or .env)" >&2
  exit 1
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "[backup] ERROR: container '$CONTAINER' not found" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/contech-$TS.archive.gz"

cleanup() {
  if [ ! -s "$OUT" ]; then rm -f "$OUT"; fi
}
trap cleanup ERR

echo "[backup] dumping '$DB' from $CONTAINER -> $OUT"
docker exec "$CONTAINER" mongodump \
  --username "$USER" \
  --password "$PASS" \
  --authenticationDatabase admin \
  --db "$DB" \
  --archive --gzip > "$OUT"

if [ ! -s "$OUT" ]; then
  echo "[backup] ERROR: produced an empty archive" >&2
  exit 1
fi
echo "[backup] wrote $(du -h "$OUT" | cut -f1) archive"

if [ -n "${BACKUP_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  if rclone copy "$OUT" "$BACKUP_REMOTE"; then
    echo "[backup] copied to $BACKUP_REMOTE"
  else
    echo "[backup] WARN: offsite copy to $BACKUP_REMOTE failed" >&2
  fi
fi

# Retention: keep the newest $KEEP archives.
kept=0
while IFS= read -r old; do
  kept=$((kept + 1))
  if [ "$kept" -gt "$KEEP" ]; then
    rm -f "$old" && echo "[backup] pruned $(basename "$old")"
  fi
done < <(ls -1t "$BACKUP_DIR"/contech-*.archive.gz 2>/dev/null || true)

echo "[backup] done"
