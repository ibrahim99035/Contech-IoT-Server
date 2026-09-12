/**
 * Seed deterministic fixtures for the full-stack simulations.
 * Creates:
 *  - users: admin, moderator, customer (emailActivated=true, active=true)
 *  - apartment (creator = customer)
 *  - room (with plaintext password -> bcrypt-hashed by pre-save)
 *  - 2 devices in the room with controlled `order` (1,2) each holding a RAW
 *    component number whose SHA-256 is stored (so socket auth hashes match).
 * Returns ids + tokens needed by the socket + MQTT simulations.
 */

'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../../src/models/User');
const Apartment = require('../../src/models/Apartment');
const Room = require('../../src/models/Room');
const Device = require('../../src/models/Device');

// sha256 hex
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

const PASSWORD = 'Password123!';
const ROOM_PASSWORD = 'RoomPass123!';

async function seed() {
  const S = { users: {}, apartmentId: null, roomId: null, devices: {}, tokens: {}, rawComponents: {} };

  // Hermetic: clear any state left by a previous run in this test DB.
  await Device.deleteMany({});
  await Room.deleteMany({});
  await Apartment.deleteMany({});
  await User.deleteMany({});

  // ── Users (create via model so bcrypt hashing applies) ────────────────
  for (const [key, role] of [['admin', 'admin'], ['moderator', 'moderator'], ['customer', 'customer']]) {
    const email = `${key}@contech-fixture.com`;
    let u = await User.findOneAndDelete({ email });
    u = await User.create({
      name: key === 'admin' ? 'Fixture Admin' : key === 'moderator' ? 'Fixture Moderator' : 'Fixture Customer',
      email,
      password: PASSWORD,
      role,
      active: true,
      emailActivated: true
    });
    S.users[key] = u;
    S.tokens[key] = jwt.sign({ id: u._id.toString(), role }, process.env.JWT_SECRET || 'test_jwt_secret', { expiresIn: '1d' });
  }

  // ── Apartment ──────────────────────────────────────────────────────────
  const apartment = await Apartment.create({
    name: 'Fixture Apartment',
    creator: S.users.customer._id
  });
  apartment.members = [S.users.customer._id];
  await apartment.save();
  S.apartmentId = apartment._id.toString();

  // ── Room (password hashed by pre('save')) ──────────────────────────────
  const room = await Room.create({
    name: 'Fixture Bedroom',
    type: 'bedroom',
    creator: S.users.customer._id,
    apartment: apartment._id,
    users: [S.users.customer._id],
    roomPassword: ROOM_PASSWORD
  });
  S.roomId = room._id.toString();
  S.room = room;

  // ── Devices with controlled order + raw component number ──────────────
  const specs = [
    { order: 1, name: 'Ceiling Light', type: 'light', raw: 'fixture-device-001' },
    { order: 2, name: 'Smart Switch', type: 'switch', raw: 'fixture-device-002' }
  ];
  for (const spec of specs) {
    const device = await Device.create({
      name: spec.name,
      type: spec.type,
      status: 'off',
      room: room._id,
      creator: S.users.customer._id,
      users: [S.users.customer._id],
      order: spec.order,
      activated: true,
      // The model's pre('save') componentNumber default runs AFTER validation
      // in Mongoose 8 (latent bug), so provide a placeholder that passes
      // `required`; we overwrite it below with sha256(raw) for socket auth.
      componentNumber: 'placeholder'
    });
    // Overwrite the auto-generated componentNumber with sha256(raw) directly
    // (bypasses pre('save')) so the /ws/device & /ws/room-esp auth hashes match.
    const hashed = sha256(spec.raw);
    await Device.updateOne({ _id: device._id }, { $set: { componentNumber: hashed } });
    S.devices[spec.order] = device._id.toString();
    S.rawComponents[spec.order] = spec.raw;
  }

  const close = async () => mongoose.connection.close();
  return { S, close, ROOM_PASSWORD, PASSWORD, sha256 };
}

module.exports = { seed, sha256 };