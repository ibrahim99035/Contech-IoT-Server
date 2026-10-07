#!/usr/bin/env bash
#
# Copy the Let's Encrypt certificate for mqtt.contech-iot.com into the broker's
# cert directory so mosquitto can serve MQTT over TLS on 8883, then restart the
# broker so it picks up a renewed cert.
#
# The certbot deploy hook (nginx/ssl refresh) calls this on renewal, and
# provision-secrets.sh calls it on every deploy. Idempotent and safe to run even
# when the source certs or the broker container do not exist yet.
#
# NOTE: this repo has core.filemode=false, so invoke as `bash scripts/sync-mqtt-certs.sh`.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

SRC="nginx/ssl"
DST="mosquitto/certs"
FULL="contech-iot.com.fullchain.pem"
KEY="contech-iot.com.privkey.pem"

log() { printf '[mqtt-certs] %s\n' "$*"; }

if [ ! -s "$SRC/$FULL" ] || [ ! -s "$SRC/$KEY" ]; then
  log "source certs missing in $SRC; nothing to sync"
  exit 0
fi

mkdir -p "$DST"
install -m 0644 "$SRC/$FULL" "$DST/fullchain.pem"
install -m 0640 "$SRC/$KEY" "$DST/privkey.pem"

# mosquitto runs as uid:gid 1883 in the eclipse-mosquitto image.
chown 1883:1883 "$DST" "$DST/fullchain.pem" "$DST/privkey.pem" 2>/dev/null \
  || log "WARN: could not chown $DST to 1883:1883 (need root)"
chmod 0750 "$DST"

# Reload the broker if it is running (no-op on a fresh host / when torn down).
if docker inspect -f '{{.State.Running}}' contech-mqtt >/dev/null 2>&1; then
  docker restart contech-mqtt >/dev/null 2>&1 || true
  log "synced certs and restarted contech-mqtt"
else
  log "synced certs (broker not running)"
fi
