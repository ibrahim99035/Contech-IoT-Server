# Contech IoT Server — System Specs

This document records the current system architecture, the refactor that standardized
the logging / MQTT / subscription subsystems, and the production connectivity setup.
It is a living reference: update it whenever infrastructure or architecture changes.

- Last updated: 2026-08-29
- Production host: `88.222.220.235` (ssh alias `contech` = `ssh root@88.222.220.235`)

---

## 1. High-level architecture

```
ESP32 devices ──MQTT──▶ Mosquitto broker ──▶ API (this app) ──▶ MongoDB (replica set)
                              │                    │
                              │                    └─▶ Redis (BullMQ task queue)
                              └─(topic sub)        └─▶ Cloudinary / Google OAuth / SMTP
```

Stack: Node.js ≥22, Express, Socket.io (WebSockets), MQTT (client + embedded Aedes
fallback), BullMQ (Redis), Mongoose (MongoDB), AdminJS, Swagger.

Entry point: `server.js` (boot order: dotenv → env validation → DB → seed subscription
system → AdminJS → Express + Socket.io → task scheduler → MQTT → graceful shutdown).

---

## 2. Full logging system

- **`src/config/logger.js`** — Winston. Env-driven:
  - `LOG_LEVEL` (default `info` prod / `debug` dev), `LOG_DIR` (default `logs/`),
    `LOG_TO_CONSOLE`, `LOG_TO_FILE`.
  - Structured JSON in production, colorized pretty in dev.
  - File rotation: `logs/error.log` (level error) + `logs/combined.log`.
  - Exposes `logger.child(context)` via `logger.childLogger` for traceable, request-aware logs.
- **`src/middleware/requestLogger.js`** — logs method, path, status, duration, `requestId`,
  `userId` per request; attaches `req.log` (child logger) for downstream handlers.
- **Convention: never use `console.*`.** Enforced by ESLint (`no-console: 'error'`).
- Morgan was removed; request logging is handled by `requestLogger`.
- **Security guardrail:** auth tokens/credentials are never logged (OAuth routes log only
  presence, not content).

### New files
- `src/config/logger.js` (upgraded)
- `src/middleware/requestLogger.js`
- `eslint.config.js` + `npm run lint` / `lint:fix`

---

## 3. Modular MQTT

The previous single 952-line `src/mqtt/mqtt-broker.js` was decomposed into focused
modules. `src/mqtt/mqtt-broker.js` remains as a **thin facade** preserving the exact
public API so all existing importers are unchanged.

### Module layout (`src/mqtt/`)
| File | Responsibility |
|---|---|
| `context.js` | Shared runtime state: live client, `io`, ESP↔room maps (single source of truth, no circular deps) |
| `topics.js` | Topic constants, subscription list, inbound topic matcher |
| `client.js` | Broker discovery (production / docker / local), embedded-Aedes fallback, `mqtt.connect`, connection events, subscribe, close |
| `messageRouter.js` | Parses + dispatches inbound messages by topic to handlers |
| `handlers/deviceHandler.js` | Device state / status messages |
| `handlers/roomHandler.js` | Room state messages + `updateRoomEspStatus` |
| `handlers/espHandler.js` | ESP auth, compact-state, disconnect, room subscribe |
| `publishers/espPublisher.js` | ESP auth/compact responses + room state/task updates |
| `publishers/devicePublisher.js` | Device / room state publish (user-initiated) |

### Public API (facade, unchanged)
`initialize, publishDeviceState, publishRoomState, publishEspStateUpdate,
publishEspRoomStateUpdate, publishEspTaskUpdate, getEspRoomMapping,
removeEspRoomMapping, handleEspDisconnection, updateRoomEspStatus, close, client,
roomEspConnections, espRoomMappings`.

- `client` is exported as a **live getter** reflecting the current connection.
- MQTT topic strings and message payloads are unchanged (device/room/ESP protocol intact).
- The dead `mqtt/` class-based directory (never referenced) was deleted.

---

## 4. Standardized subscription module

The subscription system was previously unwired (controllers existed with no routes/mounts,
two parallel models, hardcoded limits). Now standardized under a single REST surface.

### Models
- `src/models/subscriptionSystemModels.js` — `SubscriptionPlan, Subscription, Payment,
  Invoice, Feature, Coupon, AdminActivityLog`.
- `src/models/SubscriptionLimits.js` — numeric tier caps keyed by `planName`
  (`free/gold/platinum`). Added `limits.members.perApartment`.

### Enforcement
- `src/utils/subscriptionLimiter.js` — `getUserLimits`, `canCreateApartment/Room/Device/
  Task`, **`canAssignMember`** (new), `getUserUsage`, caching.
- `src/controllers/control/apartments/assignMembers.js` now enforces membership limits via
  `SubscriptionLimiter.canAssignMember` (replaced hardcoded `free=3 / paid=6`).

### Routes (`/api/subscription`, 18 routes)
Mounted in `server.js`. Standardized responses via `src/utils/response.js`, Joi
validation via `src/middleware/validate.js`, `express-async-handler` + `AppError`.

- Plans: `GET/POST/PUT/DELETE /plans[/:id]` (write = admin)
- Subscriptions: `POST /` (subscribe), `GET /my`, `DELETE /` (cancel)
- Payments: `POST /payments`, `GET /payments/:userId`
- Features: `GET/POST/DELETE /features[/:id]`
- Coupons: `POST /coupons` (admin), `GET /coupons` (admin), `GET /coupons/validate/:code`
- Activity log: `GET /admin-activities` (admin)

### AdminJS
All subscription models registered under the **Subscriptions** navigation group.

### Existing admin limits endpoints (unchanged paths)
`/admin/dashboard/subscription-limits/{get-usage,get-limits,upsert-limits,delete-limits/:planName}`.

### New/changed files
- `src/routes/subscriptionRoutes.js`, `src/validation/subscriptionValidation.js`,
  `src/middleware/validate.js`, `src/controllers/subscription/subscriptionController.js`
- Hardened: `subscriptionPlanController`, `paymentController`, `featureController`,
  `couponsController`, `adminActivityLogController`
- `src/scripts/seedSubscriptionLimits.js` (idempotent, logger-based, seeds features/plans/limits)

---

## 5. Production connectivity

The local app connects **only to production services** on `88.222.220.235`.
`.env` is git-ignored (see `.env.example` for placeholders).

| Dependency | Local `.env` | Production target | Notes |
|---|---|---|---|
| MongoDB | `MONGODB_URI=mongodb://admin:<pw>@88.222.220.235:27017/contech?authSource=admin&directConnection=true` | Mongo replica set (`contech-mongodb`) | `directConnection=true` required: the replica set advertises its internal hostname `mongodb`, unresolvable locally. |
| Redis | `REDIS_HOST=88.222.220.235`, `REDIS_PORT=6380`, `REDIS_URL=redis://:redispass123@88.222.220.235:6380` | Redis container `contech-redis` (host port `6380`) | Scheduler (BullMQ) now Redis-backed, not in-memory. |
| MQTT | `MQTT_BROKER_URL=mqtt://88.222.220.235:1884`, `MQTT_USERNAME=contech`, `MQTT_PASSWORD="@#/123Work@#/"` | Mosquitto `contech-mqtt` (1884) | Password must be **quoted** in `.env` — contains `#` (dotenv comment char). |
| Cloudinary / Google / SMTP | env creds | Remote | On-demand. |

### Production infrastructure (on `88.222.220.235`, via `contech`)
Docker compose project: `/opt/contech-smart-home-app/docker-compose.yml`
Services: `mongodb`, `mongo-express`, `api`, `mqtt-broker`, `nginx`, **`redis`**.
Redis service: `redis:7-alpine`, `--requirepass ${REDIS_PASSWORD}` (`redispass123`),
appendonly + LRU, host port **`6380:6379`**, named volume `redis-data`.

A pre-existing native Redis on the host bound to loopback `127.0.0.1:6379` (no password,
unused by other stacks) was **left untouched**; the app uses the dedicated container on 6380.

### Deployment commands
```bash
# after editing compose/.env on the server
cd /opt/contech-smart-home-app
docker-compose config          # validate
docker-compose up -d redis     # create/start redis
docker-compose up -d --no-deps api   # recreate api with new env
```

### Verified live behavior (local boot)
```
Connected to MongoDB successfully
Connected to Redis
BullMQ Task Queue & Worker connected successfully
Connected to MQTT broker
Server running in deployment mode on port 5000
```
No auth/connection errors in `logs/error.log`.

---

## 6. Quality gates
- `npm run lint` → **0 errors** (warnings are pre-existing unused-var debt; `no-console` is a hard error).
- `node --check` on all `.js` files passes.
- All existing endpoint names, HTTP methods, status codes, MQTT topics, and the MQTT
  facade API are unchanged.

---

## 7. Known issues / follow-ups
1. **AdminJS (production only):** `AdminJS.registerAdapter is not a function` — AdminJS
   dashboard fails to mount in the production container, but the server still runs.
   Independent of Redis. Needs fixing.
2. **Redis exposure:** container is on `0.0.0.0:6380` behind `redispass123`. Restrict with
   UFW/firewalld to known IPs if public exposure is not desired.
3. `.env` values containing `#`, ` `, or `=` should be **quoted** (dotenv parsing).