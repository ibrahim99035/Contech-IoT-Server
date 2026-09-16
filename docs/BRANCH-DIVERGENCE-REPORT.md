# Branch Divergence Report — `main` vs `updates` (production)

> **Prepared:** 2026-09-16
> **Purpose:** decide what to deploy to the production VPS (`88.222.220.235`, `/opt/contech-smart-home-app`).
> **Verdict:** deploy **`updates`**, never `main`. `main` is a *different, older* artifact.

---

## 1. The three states that matter

| Ref | What it is | server.js |
|---|---|---|
| `updates` @ `66c7f93` (origin tip) | The branch production **tracks**; 4 commits ahead of what runs | has AdminJS + Swagger + `/api/subscription` |
| `updates` @ `0f0f253` | **What production is actually running** (container built 2026-08-29) | has AdminJS + Swagger, **no** `/api/subscription` |
| `main` @ `e6ee2ab` | What I pushed today | **no AdminJS, no Swagger**, has `/api/subscription` |

Production checkout: `/opt/contech-smart-home-app` → branch `updates`, HEAD `0f0f253`, no `node_modules`.

**Divergence base: `4edef1f` (2025-11-16)** — the branches forked ~10 months ago.

```
                      +-- 15 commits (Aug 2026) --> origin/updates @ 66c7f93   [PRODUCTION LINE]
4edef1f (2025-11-16) -+      \- 0f0f253 = what prod RUNS (4 behind tip)
                      +-- 5 commits (May-Sep 2026) --> main @ e6ee2ab         [WHAT I PUSHED]
```

Unique commits: **15 on `updates`**, **5 on `main`**.

---

## 2. Head-to-head diff (`origin/updates` -> `main`)

| Metric | Value |
|---|---|
| Files changed | **216** |
| Added in `main` | 107 |
| Deleted in `main` | 17 |
| Modified | 91 |
| Renamed | 1 |

### server.js feature markers (grep counts)

| Ref | AdminJS | Swagger | `/api/subscription` |
|---|---|---|---|
| `0f0f253` (running) | 8 | 5 | **0** |
| `origin/updates` | 8 | 5 | **1** |
| `main` | **0** | **0** | 1 |

=> **Deploying `main` would delete the AdminJS console and the Swagger `/api-docs` endpoint from production.**

### Subsystem presence matrix

| Path | RUNNING (`0f0f253`) | `updates` | `main` |
|---|---|---|---|
| `src/config/adminjs.js` | yes | yes | **NO** |
| `src/config/redis.js` | yes | yes | **NO** |
| `src/config/swagger.js` | yes | yes | yes |
| `src/routes/subscriptionRoutes.js` | **NO** | yes | yes |
| `src/controllers/subscription/subscriptionController.js` | **NO** | yes | yes |
| `src/validation/subscriptionValidation.js` | **NO** | yes | yes |
| `src/middleware/validate.js` | **NO** | yes | yes |
| `src/mqtt/mqtt-broker.js` | yes | yes | yes |
| `mqtt/index.js` (top-level module) | yes | **NO** | yes |
| `healthcheck.js` | yes | yes | yes |
| `.dockerignore` | NO | NO | yes |
| `test/run-rest.js` | NO | NO | yes |
| `bruno-collection/` | NO | NO | yes |
| `docs/WEBAPP_SPECIFICATION.md` | NO | NO | yes |

---

## 3. DEPLOY DELTA — what deploying `updates` would actually change

`0f0f253` (running) -> `66c7f93` (`origin/updates`): **4 commits, 88 files, +2540 / -3360**.

| Class | Count |
|---|---|
| Added | 17 |
| Deleted | 7 |
| Modified | 64 |

**Changed areas:** `src/controllers` 40 · `src/websockets` 12 · `src/mqtt` 10 · `src/config` 4 · `mqtt/*` 4 · `src/routes` 2 · `src/models` 2 · `src/middleware` 2 · `server.js` 1 · `package.json` 1 · `package-lock.json` 1

**Infra untouched:** `Dockerfile` and `docker-compose.yml` are **not** in the delta (no rebuild-pipeline surprises; compose stays as configured on the VPS).

### Gained

- **The subscription system** (fixes the live `/api/subscription` -> **404**):
  - `A src/routes/subscriptionRoutes.js`, `A src/controllers/subscription/subscriptionController.js`, `A src/validation/subscriptionValidation.js`
  - `M` subscription controllers (plan/feature/coupon/payment/admin-log), `M src/models/SubscriptionLimits.js`, `M src/scripts/seedSubscriptionLimits.js`, `M src/utils/subscriptionLimiter.js`
  - `server.js`: `app.use('/api/subscription', subscriptionRoutes)`
- **Embedded Aedes MQTT fallback** + local->production MQTT wiring (`882e174`, `5fc9fa3`)

### Risk hotspots (untested by me)

- `src/websockets` — **12 files modified**: the realtime layer the simulators depend on
- `src/mqtt` (10) + `mqtt/*` (4) — MQTT module **restructured**; note top-level `mqtt/index.js` is **removed** on `updates`
- `server.js`, `package.json`, `package-lock.json` — new deps => image rebuild required
- Net **-820 lines** — a large deletion-heavy refactor, i.e. code was removed/replaced, not just added

### Lost

Nothing. The delta is strictly forward from what production runs today (no rollback of running features).

---

## 4. What deploying `main` instead would gain and lose

`0f0f253` (running) -> `main`: 105 added, 5 deleted, 53 modified.

### Would gain
- `test/run-rest.js` + `test/lib/*` — the REST suite (154/154 green locally)
- `bruno-collection/` (~57 requests)
- `docs/WEBAPP_SPECIFICATION.md`, `.dockerignore`, `healthcheck.js` hygiene, `node:22` build

### Would **lose** (production regressions)
- **AdminJS console** (`/admin`) — 0 references left in `main`'s server.js; `src/config/adminjs.js` absent
- **Swagger `/api-docs`** — 0 references in `main`'s server.js
- **Redis configuration** (`src/config/redis.js` absent in `main`) — used by the scheduler
- The **MQTT Aedes fallback** and the Aug-2026 redis/scheduler/mongoose hardening commits
- `server.js` shrinks from the production version to a **much simpler file** — 185 lines of difference

**Conclusion: `main` is not a superset of production. It is a parallel, older line.** Deploying it is a destructive downgrade.

---

## 5. Why the CI/CD "deploy" never worked

All **32** `Deploy to VPS` runs failed, including the one triggered by today's push (13s):

```
Load key "/home/runner/.ssh/id_rsa": error in libcrypto
***@***: Permission denied (publickey,password)
```

Three independent defects in `.github/workflows/deploy.yml`:

1. **`VPS_SSH_KEY` (env `VPS_Secrets`) holds a corrupt/unparseable private key** -> SSH auth fails. This is the immediate failure.
2. **Wrong directory**: the workflow `cd /opt/contech-iot/app`, which contains only `logs/` and `nginx/`. The real deployment is `/opt/contech-smart-home-app` (compose project `contech-smart-home-app`, image `contech-smart-home-app-api`). `docker-compose up` there would find no compose file.
3. **Wrong branch**: it runs `git pull origin main` against a checkout on **`updates`** — merging an unrelated line into production (destructive even if 1 and 2 were fixed).

Production is therefore deployed **manually**, not by CI. Local SSH access (`~/.ssh/id_ed25519` -> `root@88.222.220.235`) **does work**, so a manual deploy is possible today.

---

## 6. Recommendation

1. **Do not deploy `main` to production.** Keep it as the integration/testing line (it has the test suite, Bruno collection, docs).
2. **To fix the live subscription 404:** deploy `origin/updates` (`66c7f93`) to `/opt/contech-smart-home-app`:
   - `git stash` the VPS's local `docker-compose.yml`/nginx edits (no conflict — incoming commits don't touch them), `git pull origin updates`, restore stash
   - build first, then recreate the `api` container to minimise downtime
   - rollback = `git checkout 0f0f253 && docker-compose up -d --build`
   - blast radius: 88 files incl. the websockets/MQTT layers — **stage/rehearse it** before touching production
3. **Then reconcile the branches**, because the split is the root cause of all three problems:
   - merge `updates` -> `main` (or make one the source of truth) so `main` stops being an older fork
   - only then will "push to main deploys production" be a safe mental model
4. **Repair the pipeline** (independent of the deploy):
   - replace `VPS_SSH_KEY` with a working key (`~/.ssh/id_ed25519` works for `root@88.222.220.235`)
   - fix the path to `/opt/contech-smart-home-app` and deploy the intended branch
   - prefer `docker compose` v2 and `git fetch && git reset --hard origin/<branch>` over a bare `git pull`

---

## 7. Evidence index (commands used)

```
git rev-list --left-right --count origin/updates...main      -> 15  5
git merge-base origin/updates main                           -> 4edef1f (2025-11-16)
git diff --shortstat 0f0f253 origin/updates                  -> 88 files, +2540, -3360
git diff --name-status 0f0f253 origin/updates                -> 17 A, 7 D, 64 M
git diff --shortstat origin/updates main                     -> 216 files (107 A, 17 D, 91 M, 1 R)
git show <ref>:server.js | grep -ci adminjs|swagger          -> 0f0f253: 8/5 | updates: 8/5 | main: 0/0
ssh root@88.222.220.235 'git -C /opt/contech-smart-home-app branch --show-current'  -> updates
docker inspect contech-api ... working_dir                   -> /opt/contech-smart-home-app
gh run list --repo ibrahim99035/Contech-IoT-Server           -> 32/32 failures
gh run view 35079808301 --log-failed                         -> "error in libcrypto" / Permission denied
```

## 8. Verified separately (today, on `main`)

My pushed commit was validated end-to-end locally — but note it validates **`main`**, not `updates`:

- REST suite: **154/154 passed, 0 failed** (`test-reports/endpoints.md`)
- Production Docker image builds on `node:22-alpine`; container ran **healthy**
- `/health` -> `200 {"status":"OK"}`; `healthcheck.js` exit code **0**; `.env` **not** baked into the image
- `server.js` boots cleanly (Mongo connected, subscription seeding, scheduler started, MQTT subscribed)

The `updates` branch has **not** been executed/tested from this workstation.

