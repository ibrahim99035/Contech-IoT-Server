# Contech IoT Server — Local Testing & Production Connectivity Specs

Last updated: 2026-09-12
Branch: `updates` → merged to `main`

---

## 1. Production Infrastructure

| Service | Host | Port | Notes |
|---------|------|------|-------|
| MongoDB (replica set `rs0`) | 88.222.220.235 | 27017 | Requires `directConnection=true` externally |
| Redis | 88.222.220.235 | 6380 | Password-protected (`redispass123`) |
| MQTT (Mosquitto) | 88.222.220.235 | 1884 | Username: `contech` |
| Nginx | 88.222.220.235 | 80/443 | Reverse proxy |
| API (Docker) | 88.222.220.235 | 5000 | Node.js container |

SSH alias (in `~/.bashrc`): `alias contech='ssh root@88.222.220.235'`

---

## 2. MongoDB Replica Set

The production MongoDB runs as replica set `rs0` with `--keyFile` and `--auth`.

**Critical for external connections:**
- `directConnection=true` is **required** in the URI when connecting from outside Docker
- Without it, Mongoose tries to resolve the internal hostname `mongodb` advertised by the replica set
- `loadBalanced=false` prevents the driver from treating the single host as a load-balanced endpoint

Working connection URI:
```
mongodb://admin:ConTech_MongoDB_2024!Secure@88.222.220.235:27017/contech?authSource=admin&directConnection=true&loadBalanced=false&retryWrites=false
```

---

## 3. Local Development Setup

### Environment (`.env`)
```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://admin:ConTech_MongoDB_2024!Secure@88.222.220.235:27017/contech?authSource=admin&directConnection=true&loadBalanced=false&retryWrites=false
JWT_SECRET=dsasdfghjklk689743hjdsgwtt87438745slfklgji5814871506h5714984j585hjfb5y5y6dg7573jjg64gsdglkfdsjhtgh78486djkjkjjru6n89089587958m
JWT_EXPIRES_IN=6d
REDIS_HOST=88.222.220.235
REDIS_PORT=6380
REDIS_PASSWORD=redispass123
REDIS_URL=redis://:redispass123@88.222.220.235:6380
MQTT_BROKER_URL=mqtt://88.222.220.235:1884
MQTT_USERNAME=contech
MQTT_PASSWORD="@#/123Work@#/"
ADMIN_EMAIL=admin@contech.local
ADMIN_PASSWORD=Admin@123456
```

### Start Server
```bash
cd "/media/ibrahim/New Volume/Projects/Contech-IoT-Server"
node server.js
```

### Health Check
```bash
curl http://localhost:5000/health
```

---

## 4. Admin Account

Pre-seeded in production MongoDB:
- **Email:** `admin@contech.local`
- **Password:** `Admin@123456`
- **Role:** `admin`
- **Status:** `active`, `emailActivated: true`

Created directly via MongoDB on production server (bypasses API role restriction).

---

## 5. API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | No | Register new user |
| POST | `/login` | No | Login, returns JWT |
| GET | `/verify` | Yes | Verify JWT token |
| PUT | `/update-password` | Yes | Change password (fields: `oldPassword`, `newPassword`) |
| POST | `/forgot-password` | No | Request reset (requires `emailActivated`) |
| POST | `/activation-token` | No | Send activation token |
| PUT | `/activate-email` | No | Activate email with token |
| DELETE | `/delete-account` | Yes | Delete own account |

### Apartments (`/api/apartments-handler`)
| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| POST | `/apartments/create-apartment` | Yes | Body: `{ name, creator }` |
| GET | `/apartments/member` | Yes | List user's apartments |
| PUT | `/apartments/update-name` | Yes | Body: `{ id, name }` |
| DELETE | `/apartments/delete/:id` | Yes | Delete apartment |
| GET | `/apartments/:id/members` | Yes | Get members |
| PUT | `/apartments/assign-members` | Yes | Body: `{ apartmentId, members }` |
| DELETE | `/apartments/:id/remover-member/:memberId` | Yes | Remove member |
| PUT | `/apartments/:id/exit` | Yes | Exit apartment |

### Rooms (`/api/rooms-handler`)
| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| POST | `/rooms/create` | Yes | Body: `{ name, apartment, roomPassword }` |
| GET | `/rooms/apartment/:apartmentId` | Yes | Rooms by apartment |
| GET | `/rooms/user/get-all` | Yes | Rooms by user |
| PUT | `/rooms/:id/update-name` | Yes | Body: `{ name }` |
| PUT | `/rooms/:id/update-password` | Yes | Body: `{ password }` |
| PUT | `/rooms/:id/add-users` | Yes | Body: `{ users }` |
| GET | `/rooms/get-users/:roomId` | Yes | Get room users |
| PUT | `/rooms/remove-user/:roomId` | Yes | Body: `{ users }` |
| PUT | `/rooms/exit-room/:roomId` | Yes | Exit room |
| DELETE | `/rooms/delete/:id` | Yes | Delete room |

### Devices (`/api/device-handler`)
| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| POST | `/devices/create` | Yes | Body: `{ name, room, type, order }` |
| GET | `/devices/room/:roomId` | Yes | Devices by room |
| PUT | `/devices/:id/update-name` | Yes | Body: `{ name }` |
| PUT | `/devices/:id/update-component-number` | Yes | Body: `{ componentNumber }` |
| GET | `/devices/get-users/device/:deviceId` | Yes | Get device users |
| PUT | `/devices/:deviceId/assign-users` | Yes | Body: `{ users }` |
| PUT | `/devices/:deviceId/toggle-activation` | Yes | Toggle on/off |
| GET | `/devices/room/:roomId/orders` | Yes | Available orders |
| PUT | `/devices/remove-user/device/:deviceId/user/:userId` | Yes | Remove user |
| PUT | `/devices/exist-device/:deviceId` | Yes | Exit device |
| DELETE | `/devices/delete/:id` | Yes | Delete device |

### Tasks (`/api/task-handler`)
| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| POST | `/tasks/create-task` | Yes | Body: `{ name, device, timezone, action, schedule, notifications }` |
| GET | `/tasks/user/my-tasks` | Yes | My tasks |
| GET | `/tasks/get-task/:taskId` | Yes | Task by ID |
| PUT | `/tasks/update/:taskId/details` | Yes | Body: `{ name }` |
| PUT | `/tasks/:taskId/schedule/update` | Yes | Update schedule |
| PUT | `/tasks/:taskId/status` | Yes | Body: `{ status }` |
| GET | `/tasks/get-tasks/device/:deviceId` | Yes | Tasks by device |
| GET | `/tasks/user/assigned` | Yes | Assigned tasks |
| GET | `/tasks/filter` | Yes | Filter by status |
| DELETE | `/tasks/delete-task/:taskId` | Yes | Delete task |

### Subscriptions (`/api/subscription`)
| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/plans` | No | List plans |
| GET | `/plans/:id` | No | Plan by ID |
| POST | `/plans` | Admin | Create plan |
| PUT | `/plans/:id` | Admin | Update plan |
| DELETE | `/plans/:id` | Admin | Delete plan |
| POST | `/` | Yes | Subscribe (body: `{ subscriptionPlanId }`) |
| GET | `/my` | Yes | My subscription |
| DELETE | `/` | Yes | Cancel subscription |
| POST | `/payments` | Yes | Create payment (body: `{ userId, subscriptionPlanId, amount, currency, paymentMethod, paymentStatus }`) |
| GET | `/payments/:userId` | Yes | User payments |
| GET | `/features` | No | List features |
| POST | `/features` | Admin | Create feature |
| DELETE | `/features/:id` | Admin | Delete feature |
| POST | `/coupons` | Admin | Create coupon (body: `{ code, discountType, discountValue, expirationDate }`) |
| GET | `/coupons` | Admin | List coupons |
| GET | `/coupons/validate/:code` | Yes | Validate coupon |
| GET | `/admin-activities` | Admin | Activity log |

### Admin Dashboard (`/api/admin/dashboard`)
All require admin role (session-based AdminJS also available at `/admin`):
- `/apartments/all-apartments`, `/apartments/search-apartments`, `/apartments/apartment-statistics`
- `/rooms/get-all-rooms`, `/rooms/search-rooms`, `/rooms/room-statistics`
- `/devices/get-all-devices`, `/devices/search-devices`, `/devices/get-device-statistics`
- `/tasks/get-all-tasks`, `/tasks/get-task-analytics`, `/tasks/get-tasks-by-status/:status`
- `/users/get-all-users`, `/users/search-users`, `/users/user-statistics`
- `/subscription-limits/get-limits`, `/subscription-limits/get-usage`, `/subscription-limits/upsert-limits`

---

## 6. Validation Schemas (Key Fields)

### Apartment
```json
{ "name": "string (3-100)", "creator": "ObjectId (required)", "members": ["ObjectId"] }
```

### Room
```json
{ "name": "string (3-100)", "apartment": "ObjectId", "roomPassword": "string", "type": "living_room|bedroom|kitchen|..." }
```

### Device
```json
{ "name": "string (3-100)", "type": "Light|Thermostat|Camera|Lock|...", "room": "ObjectId", "order": "int (1-6)" }
```

### Task
```json
{
  "name": "string (3-100)",
  "device": "ObjectId",
  "timezone": "IANA tz",
  "action": { "type": "status_change|temperature_set|other", "value": "string|number" },
  "schedule": {
    "startDate": "ISO date",
    "startTime": "HH:MM",
    "endDate": "ISO date|null",
    "recurrence": { "type": "once|daily|weekly|monthly|custom", "interval": 1 }
  },
  "notifications": { "enabled": false, "recipients": [], "onFailure": true }
}
```

### Payment
```json
{ "userId": "ObjectId", "subscriptionPlanId": "ObjectId", "amount": 0, "currency": "USD", "paymentMethod": "string", "paymentStatus": "pending|completed|failed" }
```

### Coupon
```json
{ "code": "string", "discountType": "percentage|flat", "discountValue": 0, "expirationDate": "ISO date" }
```

---

## 7. Testing

### Automated (idempotent)
```bash
node test-idempotent.js           # Run tests
node test-idempotent.js --cleanup # Remove test data
```
Uses timestamped emails (`t<timestamp>-user@test.local`) so runs never collide.

### Manual (Bruno/Yaak)
```bash
cd bruno-collection && bruno .
```
59 pre-built request files organized by resource.

---

## 8. Key Code Changes

- **`src/config/db.js`**: Added `loadBalanced=false` parsing and connection options for replica set external connections
- **`start_server.js`**: Production launcher using direct MongoDB connection
- **`test-idempotent.js`**: Full idempotent test suite
- **`bruno-collection/`**: Bruno API client collection

---

## 9. Deployment

GitHub Actions workflows (`.github/workflows/`):
- `ci.yml` — Lint + integration tests on PR/push to `main`/`updates`
- `docker-publish.yml` — Build & push image to GHCR
- `deploy.yml` — Deploy to VPS on image publish

Current image: `ghcr.io/ibrahim99035/contech-iot-server:latest`
