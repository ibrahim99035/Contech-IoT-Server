#!/usr/bin/env bash
#
# Installs an idempotent /etc/cron.d entry that runs the MongoDB backup daily.
# Must run as root. Re-running is safe; it overwrites the managed file.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd)"
CRON_FILE="/etc/cron.d/contech-backup"

if [ "$(id -u)" != "0" ]; then
  echo "[backup-cron] must be run as root" >&2
  exit 1
fi

cat > "$CRON_FILE" <<CRON
# Managed by scripts/install-backup-cron.sh - do not edit by hand.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=""
15 2 * * * root cd $REPO && bash ./scripts/backup-mongo.sh >> $REPO/mongodb/backups/backup.log 2>&1
CRON

chmod 0644 "$CRON_FILE"
chown root:root "$CRON_FILE"
chmod +x "$REPO/scripts/backup-mongo.sh" 2>/dev/null || true
echo "[backup-cron] installed $CRON_FILE (daily 02:15)"
