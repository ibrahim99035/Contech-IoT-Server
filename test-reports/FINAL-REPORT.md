# Contech — Test & Defect Report

- **Date:** 2026-09-29
- **Repos:** `Contech-IoT-Server` (backend), `Contech-Client` (frontend)
- **Scope:** REST API, Socket.IO, MQTT integration, frontend flows

---

## 1. Verification summary

| Suite | Command | Result |
|---|---|---|
| REST — primary | `node test/run-rest.js` | **156 / 156 passed** |
| REST — gap / security / regression | `node test/run-rest-gaps.js` | **73 / 73 passed** |
| Socket.IO — 5 namespaces + end-to-end MQTT | `node test/run-sockets.js` | **53 / 53 passed** |
| Route coverage union | `node test/coverage-diff.js` | **125 / 125 routes (100%)** |
| Client build | `npm run build` (client) | **passed** |

- Total assertions: **282**, all passing.
- Untested routes: **0**
- Requests falling through to an error: **0**
- Every mounted Express route is exercised by at least one of the two REST suites.

### Environment

- Tests run against a **local replica set** on `127.0.0.1:27019` (`rs0`), never the
  production `MONGODB_URI`. Replica-set mode is required because several
  controllers use Mongo transactions.
- `test/lib/bootstrap.js` mirrors the production Express + Socket.IO wiring, but
  deliberately omits AdminJS and the Redis scheduler (see §5, open items).
- `test/lib/devstack.js` runs the real app plus Vite for browser verification on
  `localhost:5000` / `localhost:3000`, seeded with
  `admin@dev.test` / `TestPass123!` and `dana@dev.test` / `TestPass123!`.
  Restarting it wipes and reseeds users, apartments, and subscriptions.

---

## 2. Defects found and fixed

### 2.1 Backend

| # | Area | Defect | Fix |
|---|---|---|---|
| 1 | `Room` model | `esp_id: { unique: true }` created a **non-sparse unique index**. Rooms only get an `esp_id` once an ESP is paired, and a non-sparse unique index keys every missing field as `null` — so **only one room could ever exist**. The second room failed with `E11000 … dup key: { esp_id: null }`. | Declared a **partial unique index** (`partialFilterExpression: { esp_id: { $type: 'string' } }`) so uniqueness applies only to paired rooms. |
| 2 | `Room` model | `esp_id` was assigned in a **`post('save')` hook**, leaving a window where the row was inserted with no `esp_id` and immediately collided on the unique index. | Moved generation into a **`pre('validate')` hook** so the value is present at insert time. |
| 3 | Deploy | Mongoose will not replace an index that has the same name but different options, so every **pre-existing database kept the broken index** and room creation stayed broken after the schema fix. | Added an idempotent migration `src/scripts/fixRoomEspIdIndex.js` (`npm run fix:room-esp-index`) that drops the stale index and rebuilds it, then verifies the result. |
| 4 | Room validation | `Room.js` and `roomValidation.js` each declared their **own copy** of `ROOM_TYPES`. Any type added to one but not the other passed Joi validation and then failed in Mongoose with a **500** (`type: 'balcony' is not a valid enum value`). | Created `src/constants/roomTypes.js` as the single source of truth; both the model and the validator import it. |
| 5 | Device model | `pre('save')` re-generated `componentNumber` on **every** save, so renaming a device silently changed its serial and bricked the physical pairing. | Generation moved to `pre('validate')` and only runs for a **new** document with no value. |
| 6 | `createDevice` | Accepted plaintext serials, stored them as-is, and returned **201 on a duplicate** instead of 409. | Hashes the trimmed serial with SHA-256, returns **409** on duplicates, and no longer stores plaintext. Both socket namespaces authenticate against the hash. |
| 7 | Auth | `/auth/register` had **no validation at all** — an empty body registered a user, and invalid emails were persisted. | Added `src/validation/authValidation.js` and applied `registerSchema` on the route: empty body → 400, invalid email → 400, `role: 'admin'` → 403 (preserved). |
| 8 | Payments | The controller trusted a **body-supplied `userId`**, letting a caller create a subscription/invoice against **another user**. | Identity is taken **exclusively from `req.user._id`**; body identity fields are stripped; `userId` is optional and ignored in the schema. |
| 9 | `createApartment` | `creator` was accepted from the **request body** — an **IDOR** letting a caller create an apartment owned by someone else. | `creator` is stripped from the body and bound to the token; the caller is added to `members` and back-linked to their user document. |
| 10 | `exitApartment` | A non-member leaving returned **400** (bad request) instead of **403** (forbidden). | Corrected to 403. |
| 11 | Swagger | `/api-docs/json` was registered **after** the Swagger UI mount, so it returned the **UI HTML** instead of the OpenAPI document. | Registered the JSON route before the UI mount. |
| 12 | `getApartmentsByMember` | The projection omitted `createdAt`/`updatedAt`, so clients received `Invalid Date`. | Timestamps added to the projection. |
| 13 | Subscription limits | `checkSubscriptionLimits` used the wrong error status; duplicate/malformed plan handlers and malformed user IDs were unhandled. | Status corrected, duplicate plan handler removed, malformed-ID regressions added. |
| 14 | Coverage tooling | `coverage-diff` counted **middleware-served 2xx responses** (the Swagger UI) as unmatched routes — a false "unmatched request". | The recorder now captures path + status, and the report separates genuine fall-throughs from middleware-served successes. |

### 2.2 Client

| # | Area | Defect | Fix |
|---|---|---|---|
| 15 | Apartment list | Rows were not navigable; the UI listed apartments you could not open. | Row click handling plus a direct router link on the name. |
| 16 | Apartment detail | After creating a room, the rooms tab still said **"No rooms in this apartment"** until a manual page reload. `fetchApartmentById` resolves from the cached list (there is no `GET /apartments/:id`) and only refetched when the cache was **empty**. | `fetchApartmentById(id, { force: true })` bypasses the cache; the detail view forces a refetch after mutations. |
| 17 | Room types | The UI sent `livingroom`, `balcony`, `basement`, `attic`, but the server only accepted `living_room`, `bedroom`, `kitchen`, `bathroom`, `dining_room`, `office`, `garage`, `other` — so **4 of the offered types always failed with 400**. | Client option values aligned to the server contract, and `dining_room` was added. All 11 types now work end-to-end. |
| 18 | Date rendering | `formatDate` produced `Invalid Date` when timestamps were missing. | Guarded formatting. |
| 19 | `startEmbeddedBroker` / `connectBroker` | The embedded Aedes broker never actually worked. Aedes 1.x stays `closed` until `listen()` is awaited; without it the broker **accepts the TCP connection, never processes the CONNECT packet, and never sends a CONNACK** — so every client failed with `connack timeout` while the port looked open and the stack looked healthy. Separately, `connectBroker` returned as soon as `mqtt.connect()` created the socket, so it reported **success for a broker that then rejected every subscribe** with "Not authorized" — the caller had no way to know MQTT was dead. | **Fixed.** `startEmbeddedBroker` now awaits `listen()`, tears down the Aedes instance on close, and **verifies a real MQTT handshake before reporting success** (a port-open check provably cannot catch this). `connectBroker` now waits for the CONNACK, and `initialize` logs loudly and skips task handlers when MQTT is not connected. Both are covered by regression tests. |


### 2.3 MQTT integration

The VPS broker was investigated and **is running and healthy**:

| Check | Result |
|---|---|
| Host `88.222.220.235` (Hostinger, `srv680636.hstgr.cloud`) | reachable |
| TCP `1884` | **open** |
| MQTT handshake | broker answers — it is Mosquitto, alive |
| Credentials in `.env` (`MQTT_USERNAME` / `MQTT_PASSWORD`) | **authenticated** |
| Anonymous / wrong credentials | rejected (auth correctly enforced) |

**Correction:** an earlier draft of this report claimed the `.env` MQTT password
was stale and disagreed with the value in `start_server.js`. That was wrong — an
earlier probe had run without loading `.env`, so it connected with an empty
password and the broker correctly rejected it. Re-tested with `dotenv` actually
loaded, the `.env` credentials **do authenticate**. The two sources agree; the
credential is not the problem.

Two real defects were hiding behind the endless `ECONNREFUSED 127.0.0.1:1895` noise:

1. **The test harness never tried the VPS.** `test/lib/devstack.js` overrode
   `MQTT_BROKER_URL` to `mqtt://127.0.0.1:1895`, and `test/run-sockets.js` pointed
   at `mqtt://127.0.0.1:1896` — neither port had a broker. The socket suite passed
   45/45 while its MQTT client had never once connected.
2. **The embedded Aedes broker did not work at all** (see defect 19), so the
   "no external broker → start embedded" path had never functioned.

The only thing actually keeping MQTT off is `MQTT_ENABLED=false` in `.env`, which
is a deliberate opt-out and does work as intended.

**Fixes:** both the devstack and the socket suite now require a real broker and
**fail fast with the exact `docker run` command** if none is listening, rather than
degrading silently. A Mosquitto container is used for tests
(`eclipse-mosquitto:2` on `1895`, anonymous, no persistence). MQTT is now verified
end to end: five new assertions publish on the broker and assert the state is
persisted and re-emitted over `/ws/user`.

⚠️ **Security issues to action separately:**
- `start_server.js` contains a **production broker password hardcoded in source**
  and committed to the repository. It should be rotated and moved into a secret
  store / env file.
- There are now **two disagreeing credential sources** for the same broker account.

### 2.4 Test-harness defects (not product bugs)

These were masking real results and were fixed so the suites could be trusted:

- The socket suite asserted against a **stale event buffer**; MQTT greeting was captured **by value** instead of by getter.
- `run-rest-gaps.js` used an undefined identifier (`BASE` instead of `PORT`); the resulting `ReferenceError` was swallowed and the suite **hung until the 240 s watchdog** instead of failing.
- Room-type contract tests were blocked by the legitimate **8-rooms-per-apartment cap** and a **3-apartments-per-user cap**, so the sweep was reordered to run last in a cleared apartment.
- The socket suite's broker pre-flight check used `URL#host` (which includes the
  port) instead of `URL#hostname`, so it resolved `127.0.0.1:1895` as a hostname and
  always reported the broker as unreachable.

---

## 3. Regression tests added

New tests, all of which fail against the pre-fix code:

- `rooms: create second/third room` — reproduces the `esp_id` duplicate-key failure.
- `rooms: every created room got a distinct esp_id`, `esp_id is assigned at insert time (never null)`.
- `room types: server enum accepts every option the client offers` — the client/server contract.
- `room types: Mongoose enum and Joi validator agree` — prevents the duplicate-enum drift from returning.
- `room types: every type is accepted end-to-end by create` — all 11 types created over HTTP.
- `rooms: an apartment can hold 8 rooms` / `the 8-room apartment cap is enforced` — the cap is real product behaviour, now pinned.

---

## 4. Manual browser verification (real app, real UI)

- Login (customer + admin), dashboard.
- Apartment create → list → detail navigation, dates render correctly.
- **Room creation through the UI for all types, with no manual reload** — 8 succeed, the remainder are correctly refused with the documented 403 room-limit error.
- Zero unexpected console errors and zero failed requests in the verified flows.

---

## 5. Open items (not verified / needs a decision)

| # | Item | Why it is open |
|---|---|---|
| 1 | **Production secrets in source** | `start_server.js` committed the production MongoDB, Redis, MQTT and JWT secrets to source, and `.env.example` carried the real MQTT password. **Fixed** — `start_server.js` now reads them from `.env` and refuses to boot when any are missing; `.env.example` carries placeholders. The exposed values should still be rotated. |
| 2 | **AdminJS routes** | The test bootstrap does not mount AdminJS, so its resource/action routes are **not** in the 125-route inventory. A separate production-mounted harness is needed. |
| 3 | **Google OAuth success path** | Only error/negative paths are exercised. A real end-to-end success needs external OAuth credentials and interactive consent. |
| 4 | **Component-number semantics** | The model now always generates a `componentNumber` for new devices, so the UI's "Not set" state is effectively unreachable and every device displays "Set (hashed)". Decide whether a serial must be supplied at creation, or whether the label should reflect that it is system-generated. |
| 5 | **`getUserLimits` silent fallback** | Inactive or missing limit configuration silently degrades a user to the free plan with no log line, which would mask a misconfiguration in production. |
| 6 | **Public route exposure** | `GET /api/images/list` and `GET /api/images/analytics/stats` need an access review. |
| 7 | **Self-assigned `moderator` role** | Public registration accepts any role except `admin`. The schema intentionally preserves that behaviour, but allowing self-selection of `moderator` should be an explicit policy decision. |
| 8 | **Client lint debt** | `npm run lint` reports pre-existing errors/warnings unrelated to these changes. |
