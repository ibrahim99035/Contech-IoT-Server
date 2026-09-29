/**
 * Long-running hermetic dev stack for browser verification.
 * Serves the real Express + Socket.IO app on :5000 against the local test
 * replica set — never the production .env database.
 *
 * Usage: node test/lib/devstack.js
 */

'use strict';

const mongoose = require('mongoose');

const PORT = 5000;
const MONGO = process.env.DEVSTACK_MONGO || 'mongodb://127.0.0.1:27019/contech_devstack';
const PASSWORD = 'TestPass123!';

process.env.MONGODB_URI = MONGO;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'devstack_secret';
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.SCHEDULER_ENABLED = 'false';
process.env.DISABLE_ADMINJS = 'true';
// Point at a broker we own, on a port nothing else uses. Do NOT inherit the
// production MQTT_BROKER_URL: the repo .env points at the live VPS broker, and a
// local run must never subscribe to production topics (see the MQTT_ENABLED gate
// in src/mqtt/mqtt-broker.js).
process.env.MQTT_BROKER_URL = 'mqtt://127.0.0.1:1895';
process.env.MQTT_ENABLED = 'true';

const { startServer } = require('./bootstrap');
const User = require('../../src/models/User');
const Apartment = require('../../src/models/Apartment');
const { SubscriptionPlan, Subscription } = require('../../src/models/subscriptionSystemModels');
const seedSubscriptionLimits = require('../../src/scripts/seedSubscriptionLimits');

(async () => {
  // Require a real broker on 1895. We deliberately do NOT fall back to the
  // embedded Aedes broker here: on Node 22 it accepts the TCP connection but
  // never sends a CONNACK, so every MQTT connect times out and the run looks
  // healthy while MQTT is completely dead.
  const { isPortOpen } = require('../../src/mqtt/client');
  if (!(await isPortOpen(1895))) {
    throw new Error(
      'devstack: no MQTT broker on 127.0.0.1:1895.\n' +
      'Start one with:\n' +
      '  docker run -d --name contech-test-mqtt -p 1895:1883 ' +
      '-v /tmp/opencode/mosquitto/test.conf:/mosquitto/config/mosquitto.conf:ro eclipse-mosquitto:2\n' +
      '(or `docker compose up mosquitto` from the repo, which listens on 1884)'
    );
  }

  await startServer({ httpPort: PORT, mongoUri: MONGO });

  await seedSubscriptionLimits();
  await Promise.all([User.deleteMany({}), Apartment.deleteMany({}), Subscription.deleteMany({})]);
  await seedSubscriptionLimits();

  const admin = await User.create({ name: 'Dev Admin', email: 'admin@dev.test', password: PASSWORD, role: 'admin', active: true, emailActivated: true });
  const cust = await User.create({ name: 'Dana Customer', email: 'dana@dev.test', password: PASSWORD, role: 'customer', active: true, emailActivated: true });

  const plan = await SubscriptionPlan.findOne({ name: 'gold' });
  await Subscription.create({ user: cust._id, subscriptionPlan: plan._id, status: 'active', startDate: new Date() });
  const plan2 = await SubscriptionPlan.findOne({ name: 'free' });
  await Subscription.create({ user: admin._id, subscriptionPlan: plan2._id, status: 'active', startDate: new Date() });

  console.log('DEVSTACK READY');
  console.log(`  url      http://localhost:${PORT}`);
  console.log(`  db       ${MONGO}`);
  console.log(`  admin    admin@dev.test / ${PASSWORD}`);
  console.log(`  customer dana@dev.test  / ${PASSWORD}`);
  process.stdout.write('DEVSTACK_READY_MARKER\n');
})();

process.on('unhandledRejection', (e) => console.error('UNHANDLED:', e && e.message));
setTimeout(() => { console.error('DEVSTACK WATCHDOG: 6h'); process.kill(process.pid, 'SIGKILL'); }, 21600000).unref();
mongoose.connection.on('error', (e) => console.error('mongo error:', e.message));
