# Contech IoT Server — Deployment Hardening Plan

Status: in progress
Target: VPS `88.222.220.235`, `/opt/contech-smart-home-app` (shared with `rihla-prod`)
Baseline commit: `df20030`

## Context

The live Compose stack is healthy (7 days uptime) but the deployment is not
reproducible and exposes the API directly to the internet. This plan closes the
exposure, fixes a data-correctness bug, and makes a fresh host reproducible.

Live facts that shaped the plan:
- nginx reaches the API over the Compose network (`upstream api_backend { server api:5000; }`),
  so the host-published `5000:5000` is only for external/host access.
- Redis runs `allkeys-lru`; BullMQ requires `noeviction` or jobs can be evicted.
- AdminJS uses express-session's in-memory `MemoryStore` in production.
- `mongodb/keyfile`, `mosquitto/config/passwd`, TLS certs, and `.env` are untracked
  and manually provisioned; a fresh host cannot rebuild the stack.
- Certificate renewal is already automated via `certbot.timer` + renewal hooks
  (pre `stop-nginx`, deploy `copy-certs`/`copy-to-nginx`, post `start-nginx`).
- Host: 3.8 GiB RAM, 1 vCPU, ~1.1 GiB swap in use; no memory limits on either stack.

## Decisions

- **mongo-express**: set a password (keep on loopback).
- **Redis**: `noeviction`, `--maxmemory 256mb`.
- **Mongo non-root**: deferred (live replica set + root-owned `/data/db`; low gain,
  real chown risk). Revisit with a backup window.
- **Cert renewal**: already automated; only verify with `certbot renew --dry-run`.
- **Delivery**: commit and push to `main`; CI builds/publishes; deploy workflow applies.

## Changes

### P0 — exposure + correctness (`docker-compose.yml`)
- API port `5000:5000` -> `127.0.0.1:5000:5000`.
- Redis `--maxmemory-policy allkeys-lru` -> `noeviction`; `--maxmemory 128mb` -> `256mb`.
- Remove obsolete `version: '3.8'`.

### P1 — hardening
- Add per-container `mem_limit` (memory caps only; host has 1 vCPU):
  api 512m, mongodb 768m, redis 256m, mqtt-broker 128m, mongo-express 128m, nginx 64m.
- AdminJS: persist sessions in MongoDB via `connect-mongo` (`src/config/adminjs.js`),
  collection `adminjs_sessions`, ttl 6 days, `saveUninitialized: false`.
- mongo-express: require `MONGO_EXPRESS_PASSWORD` (VPS `.env` + `.env.example`).

### P2 — reproducibility + hygiene
- `scripts/provision-secrets.sh` (idempotent): create `mongodb/keyfile`
  (openssl, 400, 999:999), MQTT `passwd` (`mosquitto_passwd`), verify certs.
  Invoked by the deploy workflow before `up`.
- `server.js`: add `/health/ready` (503 unless Mongo `readyState === 1`);
  keep `/health` as liveness.
- `healthcheck.js` + Compose healthcheck -> `/health/ready`; deploy gate asserts
  `healthy` and fails the job otherwise.
- Remove the hardcoded credential in `mongodb/init/01-init.js` (env-gated user).
- Extend `scripts/scan-secrets.js` key regex to catch `PWD`/`PASSWD`.
- Untrack runtime logs (`mosquitto/logs/*.log`, `nginx/logs/*.log`) so deploys stop
  reverting them and request data leaves the public repo.

## Not in scope
- Mongo non-root (deferred).
- Consolidating the two overlapping certbot deploy hooks.
- Prometheus `/metrics` wiring / deleting stale alert rules.
- Restricting Swagger `/api-docs`.

## Verification
- `docker compose ps` all healthy; `rs.status().ok`; Redis `noeviction`.
- No `MemoryStore` warning at startup.
- `https://api-bridge.contech-iot.com/health` -> 200; off-host `:5000` closed.
- `docker stats` within caps over 24h; `certbot renew --dry-run` passes.

## Rollback
Per-commit `git revert` + redeploy. All state is in named volumes; container
restarts are safe. Immediate hotfix for the port: edit the VPS compose and
`docker compose up -d api`.
