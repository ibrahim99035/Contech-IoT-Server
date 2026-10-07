#!/usr/bin/env bash
#
# Idempotent provisioning of the untracked runtime secrets that docker-compose
# bind-mounts. Safe to run on every deploy: anything already present is left
# untouched. This exists so a fresh host can rebuild the stack without manual,
# undocumented steps.
#
# Provisions:
#   - mongodb/keyfile        (replica-set keyFile, mode 400, uid:gid 999)
#   - mosquitto/config/passwd (MQTT credentials from MQTT_USERNAME/MQTT_PASSWORD)
# and verifies (but does not create) the nginx TLS certificates, which are
# populated by the certbot deploy hook.
#
# Values are read from the environment first, then from ./.env. .env is parsed
# with sed rather than sourced, because unquoted URIs containing '&' would be
# mangled by the shell.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

log() { printf '[provision] %s\n' "$*"; }

get_env() {
  # Print the last KEY=value line's value, stripping one pair of quotes.
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -n1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# ── 1. MongoDB replica-set keyfile ──────────────────────────────────────────
KEYFILE="mongodb/keyfile"
if [ -s "$KEYFILE" ]; then
  log "mongodb keyfile present"
else
  mkdir -p mongodb
  umask 077
  openssl rand -base64 756 > "$KEYFILE"
  chmod 400 "$KEYFILE"
  chown 999:999 "$KEYFILE" 2>/dev/null || log "WARN: could not chown keyfile to 999:999 (need root)"
  log "created $KEYFILE (mode 400)"
fi

# ── 2. Mosquitto password file ──────────────────────────────────────────────
PASSFILE="mosquitto/config/passwd"
if [ -s "$PASSFILE" ]; then
  log "mosquitto passwd present"
else
  MQTT_USERNAME="${MQTT_USERNAME:-$(get_env MQTT_USERNAME)}"
  MQTT_PASSWORD="${MQTT_PASSWORD:-$(get_env MQTT_PASSWORD)}"
  if [ -z "${MQTT_USERNAME}" ] || [ -z "${MQTT_PASSWORD}" ]; then
    log "ERROR: MQTT_USERNAME/MQTT_PASSWORD not set (env or .env); cannot create $PASSFILE"
    exit 1
  fi
  mkdir -p mosquitto/config
  docker run --rm \
    -v "$ROOT/mosquitto/config:/mosquitto/config" \
    eclipse-mosquitto:2.0.18 \
    mosquitto_passwd -b -c /mosquitto/config/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"
  log "created $PASSFILE"
fi

# ── 3. TLS certificates (verify only) ───────────────────────────────────────
if [ -s nginx/ssl/contech-iot.com.fullchain.pem ] && [ -s nginx/ssl/contech-iot.com.privkey.pem ]; then
  log "nginx TLS certs present"
else
  log "WARN: nginx/ssl certs missing; the certbot deploy hook must populate them before 'up'"
fi
