# Contech IoT Server — Web Application Specification

> **Version:** 1.0.1
> **Last Updated:** 2026-09-16
> **Status:** Comprehensive
>
> This document provides a complete specification of every HTTP endpoint, WebSocket
> namespace, MQTT topic, and simulator interface in the Contech IoT Server.
> It is organized into four major sections corresponding to the four pillars
> requested: **Admin Dashboard**, **Sandbox (Manual Testing)**, **Service Health
> Check**, and **Simulators for Multiple Clients**.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Section 1 — Admin Dashboard](#section-1--admin-dashboard)
   - [1.1 Authentication \& Authorization](#11-authentication--authorization)
   - [1.2 User Management](#12-user-management)
   - [1.3 Apartment Management](#13-apartment-management)
   - [1.4 Room Management](#14-room-management)
   - [1.5 Device Management](#15-device-management)
   - [1.6 Task Management](#16-task-management)
   - [1.7 Subscription Limits](#17-subscription-limits)
   - [1.8 Image Management](#18-image-management)
3. [Section 2 — Sandbox (Manual Testing)](#section-2--sandbox-manual-testing)
   - [2.1 Authentication Endpoints](#21-authentication-endpoints)
   - [2.2 Apartment Endpoints](#22-apartment-endpoints)
   - [2.3 Room Endpoints](#23-room-endpoints)
   - [2.4 Device Endpoints](#24-device-endpoints)
   - [2.5 Task Endpoints](#25-task-endpoints)
   - [2.6 Subscription Endpoints](#26-subscription-endpoints)
   - [2.7 Google Assistant Endpoints](#27-google-assistant-endpoints)
4. [Section 3 — Service Health Check](#section-3--service-health-check)
5. [Section 4 — Simulators for Multiple Clients](#section-4--simulators-for-multiple-clients)
   - [4.1 WebSocket Namespaces](#41-websocket-namespaces)
   - [4.2 MQTT Topics](#42-mqtt-topics)
   - [4.3 Simulator Usage Guide](#43-simulator-usage-guide)

---

## 1. Architecture Overview<a name="1-architecture-overview"></a>

The Contech IoT Server is a Node.js/Express application backed by MongoDB, with
real-time communication over Socket.IO (WebSocket) and device-to-cloud messaging
over MQTT. It supports three client archetypes:

| Client Type | Authentication | Transport | Primary Namespace |
|---|---|---|---|
| **End User (mobile/web)** | JWT bearer token | WebSocket `/ws/user` | `userNamespace.js` |
| **IoT Device (ESP32/ESP8266)** | Component number (SHA-256) | WebSocket `/ws/device` | `deviceNamespace.js` |
| **Room ESP (ESP32 room hub)** | Component number (SHA-256) | WebSocket `/ws/room-esp` | `roomEspNamespace.js` |
| **MQTT Bridge Device** | Room ID + device order + password | WebSocket `/ws/mqtt-bridge` | `mqttNamespace.js` |
| **Room User (web frontend)** | JWT bearer token | WebSocket `/ws/room-user` | `roomUserNamespace.js` |
| **Admin Dashboard** | JWT bearer token + role check | HTTP REST | `/admin/dashboard/*` |

### Service Dependencies

| Service | Default URL | Config Env Vars | Purpose |
|---|---|---|---|
| **MongoDB** | `mongodb://localhost:27017/contech` | `MONGODB_URI` | Primary database (users, devices, rooms, tasks, subscriptions) |
| **Redis** | `redis://localhost:6379` | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_URL` | Caching \& pub/sub (planned for scaling) |
| **MQTT Broker** | `mqtt://localhost:1883` | `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD` | IoT device messaging protocol |
| **Google OAuth** | `oauth.googleapis.com` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Sign-In \& Smart Home fulfillment |
| **Cloudinary** | `api.cloudinary.com` | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Background image storage |

### Server Startup

```
start_server.js / start_local.sh / server.js
```

- **Port:** `process.env.PORT || 5000`
- The server connects to MongoDB first, seeds the subscription system, then
    initializes Express + HTTP + Socket.IO + MQTT broker + Task Scheduler.

---

## Section 1 — Admin Dashboard

All Admin Dashboard endpoints are prefixed with `/admin/dashboard` and require
both JWT authentication (`protect` middleware) and admin role authorization
(`authorizeRoles('admin')` middleware).

**Admin Credentials (local dev):**
- Email: `admin@contech.local`
- Password: `Admin@123456`

### 1.1 Authentication \& Authorization<a name="11-authentication--authorization"></a>

| Middleware | File | Description |
|---|---|---|
| `protect` | `src/middleware/authMiddleware.js` | Verifies JWT token from `Authorization: Bearer <token>` header, loads user into `req.user` |
| `authorizeRoles('admin')` | `src/middleware/roleMiddleware.js` | Checks `req.user.role` against the allowed roles array. Returns 403 if unauthorized, 401 if not authenticated |

**JWT Token Format:**
```
Authorization: Bearer <jwt_token>
```

### 1.2 User Management<a name="12-user-management"></a>

**Base Path:** `/admin/dashboard/users`

| Method | Endpoint | Description | Query Parameters |
|---|---|---|---|
| GET | `/get-all-users` | Get all users with comprehensive analysis and statistics | — |
| GET | `/search-users` | Search and filter users with advanced filtering and pagination | `role`, `active`, `emailActivated`, `search`, `sortBy`, `sortOrder`, `page`, `limit` |
| GET | `/user-statistics` | Get comprehensive user statistics and analytics dashboard | — |
| GET | `/get-user-by-id/:id` | Get specific user by ID with full details and analysis | — |
| PUT | `/update-user-role/:id` | Update user role (admin action) | — |
| DELETE | `/delete-account/:id` | Delete user account permanently | — |

**Update User Role Body:**
```json
{ "role": "admin" | "moderator" | "customer" }
```

**User Roles:** `admin`, `moderator`, `customer`

### 1.3 Apartment Management<a name="13-apartment-management"></a>

**Base Path:** `/admin/dashboard/apartments`

| Method | Endpoint | Description | Query Parameters |
|---|---|---|---|
| GET | `/all-apartments` | Get all apartments with comprehensive analysis and statistics | — |
| GET | `/search-apartments` | Search and filter apartments | `search`, `creatorId`, `sortBy`, `sortOrder`, `page`, `limit` |
| GET | `/apartment-statistics` | Get comprehensive apartment statistics and analytics | — |
| GET | `/apartment-members-analysis` | Get detailed analysis of apartment members and user distribution | — |
| GET | `/get-apartment-by-id/:id` | Get specific apartment by ID with full details | — |

### 1.4 Room Management<a name="14-room-management"></a>

**Base Path:** `/admin/dashboard/rooms`

| Method | Endpoint | Description | Query Parameters |
|---|---|---|---|
| GET | `/get-all-rooms` | Get all rooms with comprehensive analysis and statistics | — |
| GET | `/search-rooms` | Search and filter rooms with advanced filtering | `type`, `apartmentId`, `creatorId`, `hasPassword`, `search`, `sortBy`, `sortOrder`, `page`, `limit` |
| GET | `/room-statistics` | Get comprehensive room statistics and analytics dashboard | — |
| GET | `/get-room-usage-analysis` | Get detailed room usage analysis with device utilization metrics | — |
| GET | `/get-room-by-id/:id` | Get specific room by ID with full details | — |

### 1.5 Device Management<a name="15-device-management"></a>

**Base Path:** `/admin/dashboard/devices`

| Method | Endpoint | Description | Query Parameters |
|---|---|---|---|
| GET | `/get-all-devices` | Get all devices with comprehensive analysis and statistics | — |
| GET | `/search-devices` | Search and filter devices with advanced filtering | `type`, `status`, `activated`, `roomId`, `creatorId`, `hasCapabilities`, `search`, `sortBy`, `sortOrder`, `page`, `limit` |
| GET | `/get-device-statistics` | Get comprehensive device statistics and analytics dashboard | — |
| GET | `/get-device-performance-analysis` | Get detailed device performance analysis with task execution metrics | — |
| GET | `/get-device-by-id/:id` | Get specific device by ID with full details | — |

### 1.6 Task Management<a name="16-task-management"></a>

**Base Path:** `/admin/dashboard/tasks`

| Method | Endpoint | Description | Query Parameters |
|---|---|---|---|
| GET | `/get-all-tasks` | Get all tasks with comprehensive details | — |
| GET | `/get-task-by-id/:id` | Get specific task by ID with full details | — |
| GET | `/get-task-analytics` | Get comprehensive task analytics/statistics | — |
| GET | `/get-tasks-by-status/:status` | Get tasks by status (`active`, `completed`, `failed`, `canceled`) | — |
| GET | `/get-tasks-by-recurrence/:type` | Get tasks by recurrence type (`once`, `daily`, `weekly`, `monthly`, `yearly`, `custom`) | — |
| GET | `/get-tasks-by-user/:userId` | Get tasks by user ID | — |
| GET | `/get-tasks-by-device/:deviceId` | Get tasks by device ID | — |
| GET | `/get-tasks-with-history` | Get tasks with execution history | — |
| GET | `/get-tasks-scheduled-today` | Get tasks scheduled for today | `?timezone=` |
| GET | `/get-overdue-tasks` | Get overdue tasks | — |
| GET | `/search-tasks` | Search tasks | `q`, `status`, `recurrence`, `creator`, `device` |

### 1.7 Subscription Limits<a name="17-subscription-limits"></a>

**Base Path:** `/admin/dashboard/subscription-limits`

| Method | Endpoint | Description | Protected |
|---|---|---|---|
| GET | `/` | Get all active subscription limits | No (public) |
| POST | `/` | Create or update subscription limits | Yes (admin) |
| DELETE | `/:planName` | Deactivate subscription limits by plan name | Yes (admin) |

**Body (POST):**
```json
{
  "planName": "free",
  "limits": {
    "maxApartments": 1,
    "maxRooms": 5,
    "maxDevices": 10,
    "maxTasks": 20
  },
  "description": "Free tier limits"
}
```

### 1.8 Image Management

**Base Path:** `/admin/dashboard/background-imgs-set` (also served at `/api/images`)

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/set-background-image` | Set a background image for the admin dashboard |
| GET/POST | `/get-background-image` | Get the current background image |

Both endpoints also serve `/api/images` route. Images are stored on Cloudinary.

---

## Section 2 — Sandbox (Manual Testing)

The Sandbox section documents all user-facing REST API endpoints (non-admin).
These are the endpoints that the mobile app, web frontend, and external clients
use to interact with the system. The official manual testing collection is
maintained as a Bruno collection in `/bruno-collection/`.

**Base URL:** `http://localhost:5000` (local dev) or production server URL

All authenticated endpoints require:
```
Authorization: Bearer <jwt_token>
```

### 2.1 Authentication Endpoints

**Base Path:** `/api/auth`

| Method | Endpoint | Description | Body |
|---|---|---|---|
| POST | `/register` | Register a new user account | `{ name, email, password, role? }` |
| POST | `/login` | Login and receive JWT token | `{ email, password }` |
| POST | `/google-login` | Login/Signup with Google ID token | `{ id_token }` |
| POST | `/forgot-password` | Send password reset email | `{ email }` |
| POST | `/reset-password/:resetToken` | Reset password using token | `{ password, confirmPassword }` |
| POST | `/verify-email/:verificationToken` | Verify email address | — |
| PUT | `/update-password` | Update current user password | `{ currentPassword, newPassword }` |
| GET | `/check-google-link` | Check if Google account is linked | — |
| DELETE | `/unlink-google` | Unlink Google account | — |

**Register Body:**
```json
{ "name": "John Doe", "email": "john@example.com", "password": "Password123!", "role": "customer" }
```

**Login Response:**
```json
{
  "success": true,
  "data": {
    "token": "<jwt_token>",
    "_id": "<user_id>",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "customer",
    "active": true,
    "emailActivated": true
  }
}
```

### 2.2 Apartment Endpoints

**Base Path:** `/api/apartments-handler/apartments`

| Method | Endpoint | Description | Body |
|---|---|---|---|
| POST | `/create-apartment` | Create a new apartment | `{ name, creator }` |
| GET | `/my` | Get all apartments for the current user | — |
| GET | `/get-apartment-by-id/:id` | Get a specific apartment | — |
| PUT | `/update-name/:id` | Update apartment name | `{ name }` |
| POST | `/assign-members/:id` | Assign members to an apartment | `{ members: ["userId1", "userId2"] }` |
| GET | `/members/:id` | Get all members of an apartment | — |
| DELETE | `/remove-member/:id/:memberId` | Remove a member from an apartment | — |
| GET | `/exit-apartment/:id` | Exit an apartment (for members) | — |
| DELETE | `/delete/:id` | Delete an apartment | — |

### 2.3 Room Endpoints

**Base Path:** `/api/rooms-handler/rooms`

| Method | Endpoint | Description | Body |
|---|---|---|---|
| POST | `/create` | Create a new room | `{ name, apartment, roomPassword?, type? }` |
| GET | `/by-apartment/:apartmentId` | Get all rooms in an apartment | — |
| GET | `/by-user` | Get all rooms for the current user | — |
| GET | `/get-room-by-id/:id` | Get a specific room | — |
| PUT | `/update-name/:id` | Update room name | `{ name }` |
| PUT | `/update-password/:id` | Update room password | `{ roomPassword }` |
| DELETE | `/delete/:id` | Delete a room | — |
| GET | `/exit-room/:id` | Exit a room (for members) | — |
| POST | `/add-users/:id` | Add users to a room | `{ users: ["userId1", "userId2"] }` |
| DELETE | `/remove-user/:id/:userId` | Remove a user from a room | — |
| GET | `/users/:id` | Get all users in a room | — |

### 2.4 Device Endpoints

**Base Path:** `/api/device-handler/devices`

| Method | Endpoint | Description | Body / Params |
|---|---|---|---|
| POST | `/create` | Create a device in a room (room creator only; free-tier limit enforced via `checkDeviceLimits` — 3rd device → `403`) | `{ name, type, room, order }` |
| GET | `/room/:roomId` | List all devices in a room (room creator and assigned users) | — |
| GET | `/room/:roomId/orders` | Get available device order slots (1–6) for the room | — |
| GET | `/room/:roomId/orders/:deviceId` | Available orders + the current order of a specific device | — |
| PUT | `/:id/update-name` | Rename a device (device creator only) | `{ name }` |
| PUT | `/:id/update-component-number` | Update the device component number (stored SHA-256 hashed) | `{ componentNumber }` |
| PUT | `/:deviceId/assign-users` | Assign users to a device (device creator only) | `{ userIds: ["userId1", "userId2"] }` |
| GET | `/get-users/device/:deviceId` | List users assigned to a device | — |
| PUT | `/remove-user/device/:deviceId/user/:userId` | Remove a user from a device (device creator only) | — |
| PUT | `/exist-device/:deviceId` | Exit a device (member removes themselves) — route is spelled `exist-device` | — |
| PUT | `/:deviceId/toggle-activation` | Toggle device activation on/off (device creator only) | — |
| PUT | `/:deviceId/update-order` | Move a device to another order slot (1–6); occupied slot → `409 Conflict` | `{ order }` |
| DELETE | `/delete/:id` | Delete a device (device creator only) | — |

**Validation (`src/validation/deviceValidation.js`):**

| Field | Rules |
|---|---|
| `name` | string, 3–100 chars, required |
| `type` | enum: `Light`, `Thermostat`, `Camera`, `Lock`, `Air conditioner`, `Fan`, `Garage`, `Curtain` — required |
| `status` | enum: `on`, `off`, `locked`, `unlocked` — default `off` |
| `room` | ObjectId — required |
| `order` | integer 1–6 — required |
| `users` | array of ObjectIds — optional |
| `componentNumber` | string — optional (hashed at rest) |
| `active` | boolean — default `true` |
| capabilities | `brightness` 0–100, `color` `{ spectrumRgb, temperatureK }`, `thermostatMode` `heat\|cool\|auto\|off`, `targetTemperature`, `currentTemperature`, `lockState` `locked\|unlocked`, `nicknames` |

**Create Device Request:**
```json
{
  "name": "Living Room Light",
  "type": "Light",
  "room": "6aa3d24893126debc778a8b9",
  "order": 1
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "6aa3d24a93126debc778a8ef",
    "name": "Living Room Light",
    "type": "Light",
    "status": "off",
    "order": 1,
    "active": true,
    "creator": "<userId>",
    "room": "6aa3d24893126debc778a8b9"
  }
}
```

### 2.5 Task Endpoints

**Base Path:** `/api/task-handler/tasks`

| Method | Endpoint | Description | Body / Params |
|---|---|---|---|
| POST | `/create-task` | Create a task for a device (subscription limit enforced via `checkTaskLimits`) | `{ name, device, timezone?, action, schedule, notifications?, conditions? }` |
| GET | `/get-task/:taskId` | Get a specific task by ID (user must have access to task or device) | — |
| GET | `/user/my-tasks` | Get all tasks created by the authenticated user | — |
| GET | `/get-tasks/device/:deviceId` | Get all tasks for a specific device | — |
| GET | `/user/assigned` | Get tasks where the user is a notification recipient | — |
| GET | `/filter` | Filter tasks by status/date range with sorting and pagination | Query: `status`, `startDate`, `endDate`, `sort`, `limit`, `page` |
| PUT | `/update/:taskId/details` | Update task details (name, description, action) | `{ name?, description?, action? }` |
| PUT | `/:taskId/schedule/update` | Update task schedule (start time, recurrence, etc.) | `{ schedule }` |
| PUT | `/:taskId/status` | Update task status | `{ status }` — `active`, `completed`, `failed`, `canceled` |
| PUT | `/:taskId/notifications/add-recepiant` | Add a notification recipient — route is spelled `add-recepiant` | `{ userId }` |
| DELETE | `/delete-task/:taskId` | Delete a task (task/device creator only) | — |

**Validation (`src/validation/taskValidator.js`):**

| Field | Rules |
|---|---|
| `name` | string, 3–100 chars, required |
| `description` | string, optional |
| `device` | ObjectId, required |
| `timezone` | valid IANA timezone (validated via moment-timezone), default `UTC` |
| `action` | object, required — `{ type: "status_change"\|"temperature_set"\|"other", value: string\|number }` |
| `schedule` | object, required — `startDate` (ISO, required), `startTime` (`HH:MM` 24h, required), `endDate` (ISO, > startDate, nullable), `recurrence` |
| `schedule.recurrence` | `{ type: "once"\|"daily"\|"weekly"\|"monthly"\|"custom"` (default `once`), `daysOfWeek` (0–6, required iff weekly), `dayOfMonth` (1–31, required iff monthly), `cronExpression` (required iff custom), `interval` (≥1, default 1) `}` |
| `notifications` | `{ enabled` (default `false`), `recipients[]` (ObjectIds), `beforeExecution` (minutes ≥1), `onFailure` (default `true`) `}` |
| `conditions[]` | `{ type: "sensor_value"\|"time_window"\|"device_status"\|"user_presence", device` (required for sensor_value/device_status`), operator: "equals"\|"not_equals"\|"greater_than"\|"less_than"\|"between", value, additionalValue` (required for `between`) `}` |
| cross-field | `schedule.startDate + schedule.startTime` must be in the **future** in the specified `timezone` |

**Create Task Request:**
```json
{
  "name": "Turn on living room light",
  "description": "Evening lighting schedule",
  "device": "6aa3d24a93126debc778a8ef",
  "timezone": "Asia/Amman",
  "action": { "type": "status_change", "value": "on" },
  "schedule": {
    "startDate": "2026-09-20T00:00:00.000Z",
    "startTime": "18:30",
    "endDate": null,
    "recurrence": { "type": "daily", "interval": 1 }
  },
  "notifications": {
    "enabled": true,
    "recipients": ["6aa3d24893126debc778a89d"],
    "beforeExecution": 15,
    "onFailure": true
  }
}
```

### 2.6 Subscription Endpoints

**Base Path:** `/api/subscription` (route file `src/routes/subscriptionRoutes.js`)

> **FIXED (2026-09-16):** this router is now mounted in **both** `server.js`
> (`app.use('/api/subscription', subscriptionRoutes);`) and the full-stack test
> bootstrap (`test/lib/bootstrap.js`). Previously it was only mounted in the test
> harness, so every subscription endpoint 404'd in the running server.

| Method | Endpoint | Auth | Description | Body |
|---|---|---|---|---|
| GET | `/plans` | No | List all subscription plans | — |
| GET | `/plans/:id` | No | Get plan by ID | — |
| POST | `/plans` | Admin | Create a plan | `{ name, description, price, billingCycle, features, trialPeriod, status }` |
| PUT | `/plans/:id` | Admin | Update a plan | partial plan fields |
| DELETE | `/plans/:id` | Admin | Delete a plan | — |
| POST | `/` | Yes | Subscribe current user to a plan | `{ subscriptionPlanId }` |
| GET | `/my` | Yes | Get the current user's subscription | — |
| DELETE | `/` | Yes | Cancel the current user's subscription | `{ cancellationReason }` |
| POST | `/payments` | Yes | Create a payment record | `{ userId, subscriptionPlanId, amount, currency, paymentMethod, paymentStatus }` |
| GET | `/payments/:userId` | Yes | List a user's payments | — |
| GET | `/features` | No | List features | — |
| GET | `/features/:id` | No | Get feature by ID | — |
| POST | `/features` | Admin | Create a feature | `{ name, ... }` |
| DELETE | `/features/:id` | Admin | Delete a feature | — |
| POST | `/coupons` | Admin | Create a coupon | `{ code, discountType: "percentage"\|"flat", discountValue, expirationDate }` |
| GET | `/coupons` | Admin | List coupons | — |
| GET | `/coupons/validate/:code` | Yes | Validate a coupon code | — |
| GET | `/admin-activities` | Admin | Admin activity log | — |

**Pre-seeded plans** (via `src/scripts/seedSubscriptionLimits.js`): `free` ($0), `gold` ($29.99), `platinum` ($99.99).

**Coupon Body:**
```json
{
  "code": "SAVE20",
  "discountType": "percentage",
  "discountValue": 20,
  "expirationDate": "2026-12-31T00:00:00.000Z"
}
```

### 2.7 Google Assistant Endpoints

**Base Path:** `/api/google-assistant`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/fulfillment` | Yes (JWT) | Google Smart Home fulfillment endpoint handling `SYNC`, `QUERY`, `EXECUTE`, `DISCONNECT` intents |

**Supported intents** (`action.devices.*`): `SYNC`, `QUERY`, `EXECUTE`, `DISCONNECT`.

**Device types mapped:** `light`, `switch`, `outlet`, `fan`, `thermostat`, `lock`.

**SYNC Request:**
```json
{
  "requestId": "ff36a3cc-ec34-11e6-b1a0-64510650abcf",
  "inputs": [{ "intent": "action.devices.SYNC" }]
}
```

**SYNC Response (simplified):**
```json
{
  "requestId": "ff36a3cc-ec34-11e6-b1a0-64510650abcf",
  "payload": {
    "agentUserId": "<user_id>",
    "devices": [
      {
        "id": "<deviceId>",
        "type": "action.devices.types.LIGHT",
        "name": { "name": "Living Room Light" },
        "traits": ["action.devices.traits.OnOff"],
        "willReportState": true
      }
    ]
  }
}
```

---

## Section 3 — Service Health Check<a name="section-3--service-health-check"></a>

**Endpoint:** `GET /health` (unauthenticated, defined in `server.js`)

| Field | Description |
|---|---|
| `status` | Always `"OK"` when the process is able to serve requests |
| `timestamp` | Server time at request handling (`new Date()`) |
| `uptime` | Process uptime in seconds (`process.uptime()`) |
| `version` | `npm_package_version` if available, otherwise `"1.0.0"` |

**Response (200):**
```json
{
  "status": "OK",
  "timestamp": "2026-09-16T10:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

> **Note:** this is a liveness/HTTP-serving check only — it does not probe
> MongoDB, Redis, or MQTT connectivity. Use the startup logs or `docker healthcheck`
> (wget-based) for dependency verification.

**Quick check:**
```bash
curl http://localhost:5000/health
```

---

## Section 4 — Simulators for Multiple Clients<a name="section-4--simulators-for-multiple-clients"></a>

This section describes how each client archetype connects to the server and the
exact events it can send/receive, so simulators can be built per client type.
All namespaces are Socket.IO v4 namespaces on the same HTTP server (default port `5000`).

### 4.1 WebSocket Namespaces<a name="41-websocket-namespaces"></a>

**Auth methods:**
- **JWT namespaces** — pass `?token=<jwt>` in the handshake query; the server verifies the token and loads the user (`socket.user`).
- **Component-number namespaces** — pass `?componentNumber=<plaintext>`; the server SHA-256 hashes the value and matches it against `Device.componentNumber` in MongoDB.

| Namespace | File | Auth | Client connects with |
|---|---|---|---|
| `/ws/user` | `userNamespace.js` | JWT token | `io('ws://localhost:5000/ws/user', { query: { token } })` |
| `/ws/device` | `deviceNamespace.js` | Component number (SHA-256) | `io('ws://localhost:5000/ws/device', { query: { componentNumber } })` |
| `/ws/room-esp` | `roomEspNamespace.js` | Component number of any device in the room (SHA-256) | `io('ws://localhost:5000/ws/room-esp', { query: { componentNumber } })` |
| `/ws/room-user` | `roomUserNamespace.js` | JWT token | `io('ws://localhost:5000/ws/room-user', { query: { token } })` |
| `/ws/mqtt-bridge` | `mqttNamespace.js` | `roomId` + `deviceOrder` (1–6) + `roomPassword` (only if room has one; matched via `room.matchRoomPassword`) | `io('ws://localhost:5000/ws/mqtt-bridge', { query: { roomId, deviceOrder, roomPassword } })` |

> There is **no** `/ws/admin` namespace — the admin dashboard is HTTP REST only
> (see Section 1). AdminJS (session-based) is served separately at `/admin`.

#### `/ws/user` — End User (mobile/web)

Auto-joins socket room `device:<deviceId>` for every device the user can access.

| Direction | Event | Payload | Notes |
|---|---|---|---|
| ⬆ send | `update-state` | `{ deviceId, state }` | Access-checked; saves status, emits `state-update` to device, `state-updated` to users, publishes MQTT device state |
| ⬆ send | `get-device-info` | `{ deviceId }` | Access-checked |
| ⬆ send | `get-device-esp-status` | `{ deviceId }` | Access-checked |
| ⬆ send | `update-state-mqtt` | `{ deviceId, state }` | MQTT-only variant (`mqttHandlers`) |
| ⬆ send | `update-room-devices-mqtt` | `{ roomId, updates: [{ deviceId, state }] }` | MQTT bulk room update |
| ⬇ recv | `state-update` | `{ deviceId, state, updatedBy, userId? }` | State changes from devices/ESP |
| ⬇ recv | `state-updated` | `{ deviceId, state, updatedBy, userId, roomId, espConnected }` | Echo of user-driven updates (with live ESP status) |
| ⬇ recv | `device-info` | `{ device: { id, name, type, status, room: { id, name, espConnected } } }` | |
| ⬇ recv | `device-esp-status-response` | `{ deviceId, roomId, roomName, espConnected, timestamp }` | |
| ⬇ recv | `mqtt-state-update-sent` | `{ deviceId, state }` | Ack for `update-state-mqtt` |
| ⬇ recv | `mqtt-room-update-sent` | `{ roomId, updatesCount }` | Ack for `update-room-devices-mqtt` |
| ⬇ recv | `task-update` | `{ taskId, status: "executed"\|"failed", message, device?, action? }` | Task notifications (room `user:<creatorId>`) |
| ⬇ recv | `error` | `{ message, error? }` | Any handler failure |

#### `/ws/device` — IoT Device (ESP32/ESP8266)

Joins socket room `device:<deviceId>`.

| Direction | Event | Payload | Notes |
|---|---|---|---|
| ⬆ send | `report-state` | `{ state }` | Saves device status; notifies `/ws/user` with `state-update`; acks `state-reported` |
| ⬇ recv | `state-update` | `{ deviceId?, state, updatedBy, userId? }` | Commands from users/ESP/room updates |
| ⬇ recv | `task-update` | `{ taskId, status, message, action? }` | Task execution/failure broadcasts |
| ⬇ recv | `error` | `{ message }` | |

#### `/ws/room-esp` — Room ESP Hub

Joins socket room `room:<roomId>`.

| Direction | Event | Payload | Notes |
|---|---|---|---|
| ⬆ send | `fetch-room-devices` | — | Responds with `room-devices` |
| ⬆ send | `update-room-devices` | `{ updates: [{ deviceId, state }] }` | Bulk update; per-device results; notifies users, devices, room-user namespace |
| ⬇ recv | `room-devices` | `{ roomId, devices: [{ id, status }] }` | |
| ⬇ recv | `room-update-results` | `{ results: [{ deviceId, success, state?, message? }] }` | |
| ⬇ recv | `room-state-changed` | `{ roomId, updates }` | Emitted to `/ws/room-esp` room when a room-user updates devices |
| ⬇ recv | `room-devices-updated` | `{ roomId, updates, updatedBy }` | (Broadcast target is `/ws/room-user` rooms) |
| ⬇ recv | `error` | `{ message }` | |

#### `/ws/room-user` — Web Frontend (room view)

Auto-joins socket room `room:<roomId>` for every room the user can access.

| Direction | Event | Payload | Notes |
|---|---|---|---|
| ⬆ send | `fetch-room` | `{ roomId }` | Access-checked |
| ⬆ send | `update-room-devices` | `{ roomId, updates: [{ deviceId, state }] }` | Bulk update; notifies devices, users, room-esp, MQTT |
| ⬆ send | `fetch-user-rooms` | — | All rooms of the user with devices |
| ⬆ send | `get-esp-status` | `{ roomId }` | Access-checked |
| ⬇ recv | `room-details` | `{ room: { id, name, apartment, creator, espConnected }, devices: [{ id, name, type, status, creator }] }` | |
| ⬇ recv | `room-update-results` | `{ results: [...] }` | Ack for `update-room-devices` |
| ⬇ recv | `user-rooms` | `{ rooms: [{ room: {...}, devices: [...] }] }` | |
| ⬇ recv | `esp-status-response` | `{ roomId, espConnected, timestamp }` | |
| ⬇ recv | `room-devices-updated` | `{ roomId, updates, updatedBy, userId }` | Broadcasts to room members |
| ⬇ recv | `room-esp-status-updated` | `{ roomId, espConnected }` | ESP connect/disconnect notifications (emitted by `mqttBroker.updateRoomEspStatus`) |
| ⬇ recv | `error` | `{ message }` | |

#### `/ws/mqtt-bridge` — MQTT Bridge Device

Registers the connection in `roomEspConnections` / `espRoomMappings` and flips
the room's `esp_component_connected` status. Publishes
`home-automation/{deviceId}/status` = `{"status":"online"}` (QoS 1, retained) on connect.
On disconnect, the room status is set offline when the last ESP leaves.

| Direction | Event | Payload | Notes |
|---|---|---|---|
| ⬆ send | `report-state` | `{ state }` | Publishes MQTT device state; acks `state-reported` |
| ⬆ send | `report-room-state` | `{ roomId, updates: [{ deviceId, state }] }` | `roomId` must match the authenticated room; publishes MQTT room state |
| ⬇ recv | `mqtt-bridge-connected` | `{ deviceId, deviceName, deviceOrder, roomId, roomName }` | On connect |
| ⬇ recv | `state-reported` | `{ success: true }` | Ack |
| ⬇ recv | `room-state-reported` | `{ success: true }` | Ack |
| ⬇ recv | `error` | `{ message }` | |

### 4.2 MQTT Topics<a name="42-mqtt-topics"></a>

Source: `src/mqtt/mqtt-broker.js` (in production the server connects as a client
to `MQTT_BROKER_URL`; the embedded Aedes broker is used in the test harness).

**Base prefix:** `home-automation/`

#### Topics the server subscribes to (devices publish here)

| Topic | Purpose | Payload |
|---|---|---|
| `home-automation/{deviceId}/state` | Device state report | `{ "state": "on"\|"off", ... }` |
| `home-automation/{deviceId}/status` | Device connection status | `{ "status": "online"\|"offline" }` |
| `home-automation/room/{roomId}/state` | Bulk room state report | `{ "updates": [{ "deviceId", "state" }] }` |
| `home-automation/esp/{espId}/compact-state` | ESP compact state report | `"21"` = device order 2 is on, `"30"` = order 3 is off |
| `home-automation/esp/{espId}/auth` | ESP auth request | `{ "roomId", "roomPassword"? }` |
| `home-automation/esp/{espId}/disconnect` | ESP disconnect notice | — |

#### Topics the server publishes to

| Topic | Trigger | Payload |
|---|---|---|
| `home-automation/{deviceId}/state` (QoS 1, retained) | `publishDeviceState` — any user/device state change | `{ state, timestamp, updatedBy?, userId? }` |
| `home-automation/{deviceId}/status` (QoS 1, retained) | MQTT-bridge WS connect | `{ status: "online", timestamp }` |
| `home-automation/{deviceId}/task` | Task executed/failed (`registerTaskEventHandlers`) | `{ taskId, status: "executed"\|"failed", message, timestamp }` |
| `home-automation/room/{roomId}/state` (QoS 1) | `publishRoomState` — bulk user/WS room update | `{ updates: [{ deviceId, state }], timestamp, updatedBy? }` |
| `home-automation/esp/{espId}/auth/response` (QoS 1) | ESP auth processing result | `{ success, roomId?, roomName?, availableDevices? }` or `{ success: false, message }` |
| `home-automation/esp/{espId}/compact-state/response` (QoS 1) | Compact-state processing result | `{ success, ... }` |
| `home-automation/esp/room/{roomId}/state-update` (QoS 1) | Single-device update for ESPs in a room | `{ deviceId, deviceOrder, state, compactState: "{order}{1\|0}", timestamp }` |
| `home-automation/esp/room/{roomId}/bulk-update` (QoS 1) | Bulk room update for ESPs | `{ roomId, updates: [{ deviceId, deviceOrder, state, compactState }], timestamp }` |
| `home-automation/esp/room/{roomId}/task-update` (QoS 1) | Task notification for ESPs in a room | `{ taskId, deviceId, deviceOrder, status, message, timestamp }` |

#### Message flow examples

**User toggles a light** (`/ws/user` `update-state`):
1. `Device.status` saved in MongoDB
2. `state-update` → `/ws/device` room `device:{deviceId}`
3. `state-updated` → `/ws/user` room `device:{deviceId}` (with live `espConnected`)
4. MQTT publish `home-automation/{deviceId}/state` (retained)
5. MQTT publish `home-automation/esp/room/{roomId}/state-update` (with `compactState`)

**ESP reports via MQTT** (`home-automation/{deviceId}/state`):
1. Server matches the topic, normalizes state, saves `Device.status`
2. `state-updated` → `/ws/user` room `device:{deviceId}` (`updatedBy: "mqtt"`)
3. `publishEspStateUpdate` fans out to the room's ESP topic

**Room bulk state via MQTT** (`home-automation/room/{roomId}/state`):
1. Each `updates[]` entry validated against the room in MongoDB
2. `state-updated` → `/ws/user`, `room-devices-updated` → `/ws/room-user`
3. `home-automation/esp/room/{roomId}/bulk-update` published for ESPs

**Task scheduled/executed** (Task Scheduler emits `task-executed`/`task-failed`):
### 4.3 Simulator Usage Guide<a name="43-simulator-usage-guide"></a>

**Base URLs**

| Environment | HTTP | WebSocket |
|---|---|---|
| Local dev | `http://localhost:5000` | `ws://localhost:5000` |
| Production | `http://88.222.220.235` (behind Nginx :80/:443) | same host |

**Local admin credentials:** `admin@contech.local` / `Admin@123456`
**Services (local dev, production-backed):** MongoDB `88.222.220.235:27017`, Redis `88.222.220.235:6380`, MQTT `mqtt://88.222.220.235:1884` (user `contech`).

#### Recipe 1 — End User (mobile/web simulator)

```javascript
// 1. Login over HTTP to get a JWT
const login = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@contech.local', password: 'Admin@123456' })
});
const { data } = await login.json();
const token = data.token;

// 2. Connect the user namespace
const io = require('socket.io-client');
const socket = io('ws://localhost:5000/ws/user', { query: { token } });

socket.on('connect', () => {
  // 3. Toggle a device
  socket.emit('update-state', { deviceId: '<deviceId>', state: 'on' });
});

socket.on('state-updated', (p) => console.log('confirmed:', p));
socket.on('task-update',  (p) => console.log('task:', p));
socket.on('error',        (p) => console.error('error:', p));
```

#### Recipe 2 — IoT Device simulator (`/ws/device`)

```javascript
const socket = io('ws://localhost:5000/ws/device', {
  query: { componentNumber: '1234ABC' } // plaintext; server hashes SHA-256
});
socket.on('connect', () => {
  socket.emit('report-state', { state: 'on' }); // ack: 'state-reported'
});
socket.on('state-update', (p) => {
  // user-driven command → apply on hardware
  console.log('apply state:', p.state);
});
socket.on('task-update', (p) => console.log('task', p.status, p.action));
```

#### Recipe 3 — Room ESP simulator (`/ws/room-esp`)

```javascript
const socket = io('ws://localhost:5000/ws/room-esp', {
  query: { componentNumber: '1234ABC' } // any device in the room
});
socket.on('connect', () => socket.emit('fetch-room-devices'));
socket.on('room-devices', (p) => console.log('devices:', p.devices));

// bulk report
socket.emit('update-room-devices', {
  updates: [
    { deviceId: '<deviceId1>', state: 'on'  },
    { deviceId: '<deviceId2>', state: 'off' }
  ]
});
socket.on('room-update-results', console.log);
socket.on('room-state-changed', console.log); // user-driven changes
```

#### Recipe 4 — Web frontend room view (`/ws/room-user`)

```javascript
const socket = io('ws://localhost:5000/ws/room-user', { query: { token } });
socket.emit('fetch-room', { roomId: '<roomId>' });
socket.on('room-details', console.log);
socket.emit('fetch-user-rooms');
socket.on('user-rooms', console.log);
socket.emit('update-room-devices', {
  roomId: '<roomId>',
  updates: [{ deviceId: '<deviceId>', state: 'off' }]
});
```

#### Recipe 5 — MQTT bridge simulator (`/ws/mqtt-bridge`)

```javascript
const socket = io('ws://localhost:5000/ws/mqtt-bridge', {
  query: { roomId: '<roomId>', deviceOrder: '1', roomPassword: '<pwd>' }
});
socket.on('mqtt-bridge-connected', console.log);
socket.emit('report-state', { state: 'on' });          // single device
socket.emit('report-room-state', {                     // whole room
  roomId: '<roomId>',
  updates: [{ deviceId: '<deviceId>', state: 'off' }]
});
```

#### Recipe 6 — Raw MQTT device (no WebSocket)

```javascript
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://88.222.220.235:1884', {
  username: 'contech', password: '@#/123Work@#/'
});
client.on('connect', () => {
  client.subscribe('home-automation/<deviceId>/state');   // receive commands
  client.publish('home-automation/<deviceId>/status',
    JSON.stringify({ status: 'online' }), { retain: true });
});
client.on('message', (topic, msg) => {
  const { state } = JSON.parse(msg.toString());           // apply + confirm:
  client.publish('home-automation/<deviceId>/state',
    JSON.stringify({ state, updatedBy: 'device' }));
});
```

#### Common HTTP payloads

**Device create** — `POST /api/device-handler/devices/create`:
```json
{ "name": "Living Room Light", "type": "Light", "room": "<roomId>", "order": 1 }
```

**Task create with schedule** — `POST /api/task-handler/tasks/create-task`:
```json
{
  "name": "Turn on living room light",
  "device": "<deviceId>",
  "timezone": "Asia/Amman",
  "action": { "type": "status_change", "value": "on" },
  "schedule": {
    "startDate": "2026-09-20T00:00:00.000Z",
    "startTime": "18:30",
    "recurrence": { "type": "daily", "interval": 1 }
  }
}
```

**Subscribe to a plan** — `POST /api/subscription`:
```json
{ "subscriptionPlanId": "<planId from GET /api/subscription/plans>" }
```

#### Simulator checklist

- [ ] HTTP: register → login → verify token
- [ ] HTTP: apartment → room → device (capture IDs from responses)
- [ ] WS `/ws/user`: `update-state` → observe `state-updated` + retained MQTT state
- [ ] WS `/ws/device`: `report-state` → observe user-side `state-update`
- [ ] WS `/ws/room-esp`: `update-room-devices` → observe `room-update-results`
- [ ] WS `/ws/room-user`: `fetch-room`, `update-room-devices`, `get-esp-status`
- [ ] WS `/ws/mqtt-bridge`: connect → confirm `/status` online published
- [ ] MQTT: publish to `home-automation/{deviceId}/state` → observe DB + WS updates
- [ ] Tasks: create with future `startDate+startTime` → observe `task-update` on execution

---

*End of specification. Related docs: [MQTT-Docs.md](./MQTT-Docs.md) (module internals),
[SPECS-LOCAL-TESTING.md](./SPECS-LOCAL-TESTING.md) (infra & connectivity),
Bruno collection in `/bruno-collection/` (59 ready-to-run requests).*

