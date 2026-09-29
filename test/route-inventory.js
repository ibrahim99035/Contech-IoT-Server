/**
 * Route inventory — ground truth for "did we test everything?".
 *
 * Walks the live Express router stack (so it sees the real production mounts,
 * nested routers and all), records every (method, path) plus its middleware
 * guards, then PROBES each one unauthenticated to prove the path really is
 * mounted (a 404 carrying code=NOT_FOUND with a "Not Found -" message means
 * the path did not match any route at all).
 *
 * Emits test-reports/route-inventory.json
 *
 * Usage: node test/route-inventory.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const { startServer, stopServer } = require('./lib/bootstrap');
const { request } = require('./lib/httpClient');

const PORT = 5097;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27019/contech_route_inventory';

// Express 4 encodes a mount point as a regexp, e.g. /^\/api\/auth\/?(?=\/|$)/i
const LOOKAHEAD = '\\/?(?=\\/|$)';

function mountPathOf(layer) {
  if (!layer.regexp) return '';
  let s = layer.regexp.source;
  if (s.startsWith('^')) s = s.slice(1);
  const i = s.indexOf(LOOKAHEAD);
  if (i !== -1) s = s.slice(0, i);
  s = s.replace(/\\\//g, '/');
  return s === '' ? '/' : s;
}

// Handler names reveal the guard chain: protect (auth), authorizeRoles (RBAC),
// validate (schema), upload (multer) etc.
function guardsOf(layer) {
  const names = [];
  for (const h of layer.route.stack || []) {
    if (h.name && h.name !== '<anonymous>') names.push(h.name);
  }
  return names;
}

function collect(app) {
  const out = [];
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const m of Object.keys(layer.route.methods)) {
          if (!layer.route.methods[m]) continue;
          out.push({
            method: m.toUpperCase(),
            path: (prefix + layer.route.path).replace(/\/{2,}/g, '/'),
            guards: guardsOf(layer),
          });
        }
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        const p = prefix + mountPathOf(layer);
        walk(layer.handle.stack, p === '/' ? '' : p);
      }
    }
  };
  walk(app._router.stack, '');
  // de-dup identical method+path
  const seen = new Set();
  return out.filter((r) => {
    const k = `${r.method} ${r.path}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));
}

const isUnmounted = (body) =>
  body && typeof body === 'object' && body.code === 'NOT_FOUND' &&
  typeof body.message === 'string' && body.message.startsWith('Not Found -');

async function main() {
  process.env.MONGODB_URI = MONGODB_URI;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'inventory_secret';
  process.env.SCHEDULER_ENABLED = 'false';
  process.env.PORT = String(PORT);
  process.env.NODE_ENV = 'test';
  process.env.MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1897';

  const { app } = await startServer({ httpPort: PORT, mongoUri: MONGODB_URI });
  const routes = collect(app);
  console.log(`Discovered ${routes.length} routes\n`);

  // Probe each route with a harmless placeholder id so param validation
  // short-circuits (no writes). A route that is genuinely mounted answers with
  // something other than the notFound signature.
  const probed = [];
  for (const r of routes) {
    const p = r.path.replace(/:([A-Za-z_]+)(\?)?/g, (_, name) => (name === 'id' ? '000000000000000000000000' : 'x'));
    let status = null, unmounted = null, note = '';
    try {
      const res = await request(PORT, r.method, p, r.method === 'GET' ? null : {}, null);
      status = res.statusCode;
      unmounted = isUnmounted(res.body);
    } catch (e) {
      note = e.message;
    }
    probed.push({ ...r, probePath: p, probeStatus: status, unmounted, note });
  }

  const byMethod = probed.reduce((a, r) => ({ ...a, [r.method]: (a[r.method] || 0) + 1 }), {});
  const badMount = probed.filter((r) => r.unmounted);
  const unguarded = probed.filter((r) => !r.guards.includes('protect') && !r.path.startsWith('/health') && !/swagger|docs/.test(r.path));

  const report = { generatedAt: new Date().toISOString(), totals: { routes: probed.length, byMethod }, badMount, unguarded, routes: probed };
  const outDir = path.join(__dirname, '..', 'test-reports');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'route-inventory.json'), JSON.stringify(report, null, 2));

  console.log('By method:', JSON.stringify(byMethod));
  console.log(`\nUnmounted (path extraction wrong, or truly dead): ${badMount.length}`);
  badMount.forEach((r) => console.log(`  ${r.method} ${r.path} -> ${r.probeStatus}`));
  console.log(`\nRoutes with NO auth guard: ${unguarded.length}`);
  unguarded.forEach((r) => console.log(`  ${r.method} ${r.path} -> ${r.probeStatus}  [${r.guards.join(',') || 'no guards'}]`));

  await mongoose.connection.close().catch(() => {});
  await stopServer();
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
