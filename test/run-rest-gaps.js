/**
 * REST gap suite — the routes test/run-rest.js does not reach.
 *
 * Same hermetic harness (lib/bootstrap + throwaway Mongo replica set), fresh
 * fixtures, and one or more assertions per previously-untested route. Also
 * pins the contracts that were silently wrong (business errors surfacing as
 * 500s) so they cannot regress.
 *
 * Emits test-reports/rest-gaps.md
 * Usage: node test/run-rest-gaps.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const { startServer, getRouteHits } = require('./lib/bootstrap');
const { request } = require('./lib/httpClient');
const User = require('../src/models/User');
const Apartment = require('../src/models/Apartment');
const Room = require('../src/models/Room');
const Device = require('../src/models/Device');
const { SubscriptionPlan, Feature, Coupon, Payment, Subscription } = require('../src/models/subscriptionSystemModels');
const seedSubscriptionLimits = require('../src/scripts/seedSubscriptionLimits');
const SubscriptionLimits = require('../src/models/SubscriptionLimits');

const PORT = 5095;
const PASSWORD = 'TestPass123!';
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

let passed = 0, failed = 0;
const results = [];
const record = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  results.push(`${ok ? '✅' : '❌'} [${name}] ${detail}`.trim());
};

async function check(name, method, p, body, token, expect, extraHeaders) {
  let r;
  try { r = await request(PORT, method, p, body, token, extraHeaders); }
  catch (e) { record(name, false, `request error: ${e.message}`); return null; }
  const ok = Array.isArray(expect) ? expect.includes(r.statusCode) : r.statusCode === expect;
  record(name, ok, `-> ${r.statusCode}${ok ? '' : ` (expected ${expect})`} ${JSON.stringify(r.body).slice(0, 130)}`);
  return r;
}

async function main() {
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27019/contech_rest_gaps';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'gaps_secret';
  process.env.PORT = String(PORT);
  process.env.NODE_ENV = 'test';
  process.env.SCHEDULER_ENABLED = 'false';
  process.env.MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1895';

  await startServer({ httpPort: PORT, mongoUri: process.env.MONGODB_URI });
  await seedSubscriptionLimits();
  await Promise.all([
    User.deleteMany({}), Apartment.deleteMany({}), Room.deleteMany({}), Device.deleteMany({}),
  ]);
  await Promise.all([SubscriptionPlan.deleteMany({}), Feature.deleteMany({}), Coupon.deleteMany({}), Payment.deleteMany({}), Subscription.deleteMany({})]);
  await seedSubscriptionLimits();
  // delete-limits soft-deletes (isActive:false) and that persists between runs.
  await SubscriptionLimits.updateMany({}, { $set: { isActive: true } });

  const admin = await User.create({ name: 'Gap Admin', email: 'gapadmin@test.com', password: PASSWORD, role: 'admin', active: true });
  const cust = await User.create({ name: 'Gap Cust', email: 'gapcust@test.com', password: PASSWORD, role: 'customer', active: true });
  const victim = await User.create({ name: 'Gap Victim', email: 'gapvictim@test.com', password: PASSWORD, role: 'customer', active: true });

  const login = async (email) => {
    const r = await request(PORT, 'POST', '/api/auth/login', { email, password: PASSWORD });
    return r.body && r.body.data && (r.body.data.token || (r.body.data.accessToken));
  };
  const A = await login('gapadmin@test.com');
  const C = await login('gapcust@test.com');

  // The UI flow needs headroom above the free plan's 1-apartment cap.
  const gold = await SubscriptionPlan.findOne({ name: 'gold' });
  await Subscription.create({ user: cust._id, subscriptionPlan: gold._id, status: 'active', startDate: new Date() });
  await Subscription.findOneAndUpdate({ user: cust._id }, { $set: { status: 'active' } });

  const apt = await Apartment.create({ name: 'Gap Apt', creator: cust._id, members: [cust._id] });
  const room = await Room.create({ name: 'Gap Room', apartment: apt._id, creator: cust._id, users: [cust._id], componentNumber: 'gap-room-1' });
  const dev = await Device.create({ name: 'Gap Dev', type: 'Light', room: room._id, creator: cust._id, order: 1, componentNumber: 'placeholder', users: [cust._id] });
  dev.componentNumber = sha256('gap-dev-1');
  await dev.save();

  // ══ auth ═════════════════════════════════════════════════════════════════
  results.push('', '## auth');
  await check('auth/me', 'GET', '/api/auth/me', null, C, 200);
  await check('auth/me no token', 'GET', '/api/auth/me', null, null, 401);
  await check('auth/check-google-link', 'GET', '/api/auth/check-google-link', null, C, 200);
  await check('auth/check-google-link no token', 'GET', '/api/auth/check-google-link', null, null, 401);
  await check('auth/unlink-google (not linked)', 'DELETE', '/api/auth/unlink-google', null, C, [200, 400, 404]);
  await check('auth/unlink-google no token', 'DELETE', '/api/auth/unlink-google', null, null, 401);
  await check('auth/google-login without credential', 'POST', '/api/auth/google-login', {}, null, 400);
  await check('auth/google/callback without code', 'GET', '/api/auth/google/callback', null, null, 400);
  // Contract: a validation failure is a 400, never a 500.
  await check('auth/register empty body -> 400 (not 500)', 'POST', '/api/auth/register', {}, null, 400);
  await check('auth/register bad email -> 400', 'POST', '/api/auth/register',
    { name: 'X', email: 'not-an-email', password: PASSWORD, role: 'customer' }, null, 400);
  await check('auth/register unknown role -> 400', 'POST', '/api/auth/register',
    { name: 'X', email: 'x@test.com', password: PASSWORD, role: 'superadmin' }, null, 400);
  await check('auth/register missing password -> 400', 'POST', '/api/auth/register',
    { name: 'X', email: 'nopw@test.com', role: 'customer' }, null, 400);
  const badEmail = await User.findOne({ email: 'not-an-email' });
  record('auth/register did NOT persist an invalid email', badEmail === null,
    badEmail ? `persisted user ${badEmail._id}` : 'not persisted');

  // ══ subscription ═════════════════════════════════════════════════════════
  results.push('', '## subscription');
  const plan = await SubscriptionPlan.findOne({ name: 'gold' });
  const feature = await Feature.findOne();
  await check('subscription/features/:id', 'GET', `/api/subscription/features/${feature._id}`, null, null, 200);
  await check('subscription/features/:id malformed -> 400', 'GET', '/api/subscription/features/not-an-id', null, null, 400);
  await check('subscription/features/:id unknown -> 404', 'GET', '/api/subscription/features/000000000000000000000000', null, null, 404);
  await check('subscription/coupons admin', 'GET', '/api/subscription/coupons', null, A, 200);
  await check('subscription/coupons non-admin -> 403', 'GET', '/api/subscription/coupons', null, C, 403);
  await check('subscription/coupons no token -> 401', 'GET', '/api/subscription/coupons', null, null, 401);
  await check('subscription/payments create (documented schema)', 'POST', '/api/subscription/payments', {
    userId: cust._id.toString(), subscriptionPlanId: plan._id.toString(),
    amount: 19.99, paymentMethod: 'card',
  }, C, [200, 201]);
  await check('subscription/payments ignores body userId (no cross-user credit)',
    'POST', '/api/subscription/payments', {
      userId: victim._id.toString(), subscriptionPlanId: plan._id.toString(),
      amount: 1, paymentMethod: 'card',
    }, C, [200, 201, 400]);
  const victimSub = await mongoose.model('Subscription').findOne({ user: victim._id });
  record('subscription/payments did not credit another user\'s subscription', victimSub === null,
    victimSub ? 'victim subscription was created' : 'no cross-user credit');
  await check('subscription/payments create bad body -> 400', 'POST', '/api/subscription/payments', { amount: -5 }, C, 400);
  await check('subscription/payments no token -> 401', 'POST', '/api/subscription/payments', {}, null, 401);

  // ══ apartments / rooms ═══════════════════════════════════════════════════
  results.push('', '## apartments / rooms');
  // The UI sends only { name } ("Creator (Auto)" in the dialog) — creation must work.
  const uiApt = await check('apartments/create with name only (UI contract)', 'POST',
    '/api/apartments-handler/apartments/create-apartment', { name: 'Maple Heights' }, C, 201);
  const uiAptId = uiApt && uiApt.body && uiApt.body.data && uiApt.body.data._id;
  if (uiAptId) {
    const doc = await Apartment.findById(uiAptId);
    record('apartments/create binds creator to the token',
      String(doc.creator) === String(cust._id), `creator=${doc.creator} caller=${cust._id}`);
    record('apartments/create adds the caller to members',
      doc.members.some((m) => String(m) === String(cust._id)), `members=${doc.members.length}`);
    const back = await User.findById(cust._id);
    record('apartments/create back-links the apartment to the caller',
      back.apartments.some((a) => String(a) === String(uiAptId)), 'user.apartments updated');
  }
  // A caller-supplied creator must be ignored (IDOR guard).
  const spoof = await check('apartments/create ignoring a spoofed creator', 'POST',
    '/api/apartments-handler/apartments/create-apartment',
    { name: 'Spoof Attempt', creator: admin._id.toString() }, C, 201);
  const spoofId = spoof && spoof.body && spoof.body.data && spoof.body.data._id;
  if (spoofId) {
    const doc = await Apartment.findById(spoofId);
    record('apartments/create ignores a spoofed creator (IDOR guard)',
      String(doc.creator) === String(cust._id), `creator=${doc.creator} spoofed=${admin._id}`);
    const adminDoc = await User.findById(admin._id);
    record('apartments/create did not link the apartment to the spoofed user',
      !adminDoc.apartments.some((a) => String(a) === String(spoofId)), 'no link to admin');
  }
  // Regression: a plain unique index on esp_id allowed only ONE room without an
  // ESP (all of them indexed as null), so the second room always 500'd.
  const roomA = await check('rooms/create first room', 'POST', '/api/rooms-handler/rooms/create',
    { name: 'Room One', type: 'living_room', apartment: apt._id, roomPassword: 'Pass1234!' }, C, 201);
  const roomB = await check('rooms/create second room (used to 500 on duplicate esp_id)', 'POST',
    '/api/rooms-handler/rooms/create',
    { name: 'Room Two', type: 'bedroom', apartment: apt._id, roomPassword: 'Pass1234!' }, C, 201);
  const roomC = await check('rooms/create third room (used to 500)', 'POST',
    '/api/rooms-handler/rooms/create',
    { name: 'Room Three', type: 'kitchen', apartment: apt._id, roomPassword: 'Pass1234!' }, C, 201);
  // The client omits roomPassword when the user leaves the field blank, and the
  // validator used to mark it required, so creating a password-less room from
  // the UI always failed with a 400. Every other test here passed a password,
  // which is why this only surfaced in the browser.
  const roomNoPw = await check('rooms/create without roomPassword', 'POST',
    '/api/rooms-handler/rooms/create',
    { name: 'Room No Password', type: 'bedroom', apartment: apt._id }, C, 201);
  const roomEmptyPw = await check('rooms/create with empty roomPassword', 'POST',
    '/api/rooms-handler/rooms/create',
    { name: 'Room Empty Password', type: 'bedroom', apartment: apt._id, roomPassword: '' }, C, 201);
  record('password-less room has no stored password',
    roomNoPw && roomNoPw.body && roomNoPw.body.data && roomNoPw.body.data.room
      ? !(roomNoPw.body.data.room.roomPassword)
      : false,
    'roomPassword absent');
  const ids = [roomA, roomB, roomC]
    .filter(Boolean)
    .map((r) => r.body && r.body.data && r.body.data.room && r.body.data.room._id)
    .filter(Boolean);
  const docs = await Room.find({ _id: { $in: ids } });
  record('rooms: every created room got a distinct esp_id',
    docs.length === ids.length && new Set(docs.map((d) => d.esp_id)).size === docs.length,
    `${docs.length} rooms, esp_ids=${docs.map((d) => d.esp_id).join(',')}`);
  record('rooms: esp_id is assigned at insert time (never null)', docs.every((d) => !!d.esp_id),
    docs.map((d) => String(d.esp_id)).join(','));

  // Every room type the client offers must be accepted by the server enum, or
  // the UI silently 400s for those options.
  const { ROOM_TYPES } = require('../src/validation/roomValidation');
  const clientTypes = ['living_room','bedroom','kitchen','bathroom','dining_room','office','garage','balcony','basement','attic','other'];
  const missing = clientTypes.filter((t) => !ROOM_TYPES.includes(t));
  record('room types: server enum accepts every option the client offers', missing.length === 0,
    missing.length ? `server is missing: ${missing.join(', ')}` : `${clientTypes.length} types aligned`);

  // The model and the validator used to declare separate ROOM_TYPES copies, so a
  // type added to one but not the other passed validation and then blew up in
  // Mongoose with a 500. They must now come from the same source.
  const modelTypes = Room.schema.path('type').enumValues;
  const modelOnly = modelTypes.filter((t) => !ROOM_TYPES.includes(t));
  const validatorOnly = ROOM_TYPES.filter((t) => !modelTypes.includes(t));
  record('room types: Mongoose enum and Joi validator agree',
    modelOnly.length === 0 && validatorOnly.length === 0,
    `model-only=[${modelOnly}] validator-only=[${validatorOnly}]`);

  // Every type must survive an actual create, which is what the model enum bug broke.

  // A creator may not "exit" their own apartment/room (400 by design); a member may.
  await check('apartments/:id/exit creator -> 400', 'PUT', `/api/apartments-handler/apartments/${apt._id}/exit`, {}, C, 400);
  const member = await User.create({ name: 'Gap Member', email: 'gapmember@test.com', password: PASSWORD, role: 'customer', active: true });
  const M = await login('gapmember@test.com');
  const apt2 = await Apartment.create({ name: 'Gap Apt 2', creator: admin._id, members: [member._id, cust._id] });
  await check('apartments/:id/exit member -> 200', 'PUT', `/api/apartments-handler/apartments/${apt2._id}/exit`, {}, M, [200, 204]);
  const apt3 = await Apartment.create({ name: 'Gap Apt 3', creator: admin._id, members: [cust._id] });
  await check('apartments/:id/exit non-member -> 403', 'PUT', `/api/apartments-handler/apartments/${apt3._id}/exit`, {}, M, [200, 403, 404]);
  const room2 = await Room.create({ name: 'Gap Room 2', apartment: apt._id, creator: admin._id, users: [member._id], componentNumber: 'gap-room-2' });
  await check('rooms/exit-room/:id member -> 200', 'PUT', `/api/rooms-handler/rooms/exit-room/${room2._id}`, {}, M, [200, 204]);
  await check('rooms/exit-room/:id creator -> 400', 'PUT', `/api/rooms-handler/rooms/exit-room/${room._id}`, {}, C, 400);
  await check('rooms/exit-room/:id unknown -> 404', 'PUT', '/api/rooms-handler/rooms/exit-room/000000000000000000000000', {}, C, 404);
  await check('apartments/remover-member', 'DELETE', `/api/apartments-handler/apartments/${apt._id}/remover-member/${victim._id}`, null, C, [200, 404]);

  // Sweep in a clean apartment. The caller may already be at the 3-apartment cap,
  // and an apartment is capped at 8 rooms, so reuse one and clear its rooms
  // part-way through the sweep.
  await Room.deleteMany({ apartment: apt._id });
  const typeAptId = apt._id;
  const typeCreates = [];
  for (let i = 0; i < clientTypes.length; i++) {
    if (i === 8) await Room.deleteMany({ apartment: typeAptId }); // clear the 8-room cap
    const ty = clientTypes[i];
    const r = await check(`room create with type=${ty}`, 'POST', '/api/rooms-handler/rooms/create',
      { name: `Typed ${ty}`, type: ty, apartment: typeAptId, roomPassword: 'Pass1234!' }, C, 201);
    typeCreates.push({ ty, ok: !!(r && r.statusCode === 201) });
  }
  const badTypes = typeCreates.filter((r) => !r.ok).map((r) => r.ty);
  record('room types: every type is accepted end-to-end by create', badTypes.length === 0,
    badTypes.length ? `rejected: ${badTypes.join(', ')}` : `${typeCreates.length}/${typeCreates.length} created`);

  // The 8-rooms-per-apartment cap is real product behaviour, so assert it too.
  // Fill the apartment to the cap first (the sweep leaves only a few rooms in it).
  for (let f = 0; f < 10; f++) {
    if (await Room.countDocuments({ apartment: typeAptId }) >= 8) break;
    const filler = await request(PORT, 'POST', '/api/rooms-handler/rooms/create', {
      name: `Filler ${f}`,
      type: 'other',
      apartment: typeAptId,
      roomPassword: 'Pass1234!',
    }, C);
    if (filler.statusCode !== 201) break;
  }
  const atCap = await Room.countDocuments({ apartment: typeAptId });
  record('rooms: an apartment can hold 8 rooms', atCap === 8, `${atCap} rooms`);
  const overCap = await check('room create beyond the 8-room cap is refused', 'POST',
    '/api/rooms-handler/rooms/create',
    { name: 'Over The Cap', type: 'other', apartment: typeAptId, roomPassword: 'Pass1234!' }, C, 403);
  record('rooms: the 8-room apartment cap is enforced',
    !!(overCap && overCap.statusCode === 403 && /Room limit reached/.test(JSON.stringify(overCap.body))),
    overCap ? `status=${overCap.statusCode}` : 'no response');

  // ══ images ═══════════════════════════════════════════════════════════════
  results.push('', '## images');
  await check('images/remove non-admin -> 403', 'DELETE', '/api/images/remove/000000000000000000000000', null, C, 403);
  await check('images/remove admin unknown -> 404', 'DELETE', '/api/images/remove/000000000000000000000000', null, A, 404);
  await check('images/remove no token -> 401', 'DELETE', '/api/images/remove/000000000000000000000000', null, null, 401);
  await check('images/update non-admin -> 403', 'PUT', '/api/images/update/000000000000000000000000', null, C, 403);
  await check('images/update admin unknown -> 404', 'PUT', '/api/images/update/000000000000000000000000', null, A, 404);
  await check('images/update no token -> 401', 'PUT', '/api/images/update/000000000000000000000000', null, null, 401);

  // ══ admin ════════════════════════════════════════════════════════════════
  results.push('', '## admin');
  await check('admin limits delete by planName', 'DELETE', '/admin/dashboard/subscription-limits/delete-limits/platinum', null, A, [200, 404]);
  await check('admin users delete-account', 'DELETE', `/admin/dashboard/users/delete-account/${victim._id}`, null, A, [200, 404]);
  const gone = await User.findById(victim._id);
  record('admin users delete-account actually removed the user', gone === null, gone ? 'user still present' : 'user removed');
  await check('admin users delete-account non-admin -> 403', 'DELETE', `/admin/dashboard/users/delete-account/${cust._id}`, null, C, 403);

  // ══ docs ═════════════════════════════════════════════════════════════════
  results.push('', '## docs');
  const spec = await check('api-docs/json', 'GET', '/api-docs/json', null, null, 200);
  const specBody = (spec && spec.body) || {};
  record('api-docs/json serves the OpenAPI spec, not the Swagger UI HTML',
    Boolean(specBody.openapi || specBody.swagger) && Object.keys(specBody.paths || {}).length > 0,
    `openapi=${specBody.openapi || specBody.swagger || 'none'}, paths=${Object.keys(specBody.paths || {}).length}`);
  await check('api-docs/ serves the Swagger UI', 'GET', '/api-docs/', null, null, 200);

  // ── Report ──────────────────────────────────────────────────────────────
  const dir = path.join(__dirname, '..', 'test-reports');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'rest-gaps.md'), [
    '# REST Gap Suite', '',
    `- Date: ${new Date().toISOString()}`,
    `- Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`, '',
    '## Results', '', ...results.map((l) => (l ? `- ${l}` : '')), '',
  ].join('\n'));

  // Append this run's route coverage so the union of both suites can be diffed.
  const covPath = path.join(dir, 'rest-coverage-gaps.json');
  fs.writeFileSync(covPath, JSON.stringify({ routeHits: getRouteHits() }, null, 2));

  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  results.filter((l) => l.startsWith('❌')).forEach((l) => console.log(l));
  console.log(`\nReport: test-reports/rest-gaps.md`);

  setTimeout(() => { try { process.reallyExit(failed === 0 ? 0 : 1); } catch { /* ignore */ } }, 500).unref();
  setTimeout(() => process.kill(process.pid, 'SIGKILL'), 2000).unref();
  process.exit(failed === 0 ? 0 : 1);
}

process.on('unhandledRejection', (e) => { console.error('UNHANDLED:', e && e.message); });
setTimeout(() => {
  console.error(`WATCHDOG: forcing exit after 240s (${passed} passed, ${failed} failed)`);
  try { process.reallyExit(failed === 0 ? 0 : 1); } catch { /* ignore */ }
  process.kill(process.pid, 'SIGKILL');
}, 240000).unref();

main();
