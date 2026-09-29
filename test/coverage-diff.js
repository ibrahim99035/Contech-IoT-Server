/**
 * Coverage diff: route inventory (ground truth) vs routes the REST suite
 * actually MATCHED. Both sides are the server's own route templates, so this is
 * an exact set difference — no guessing about which URL segment is which :param.
 *
 * Emits test-reports/coverage-gaps.md
 * Usage: node test/coverage-diff.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'test-reports');
const inv = JSON.parse(fs.readFileSync(path.join(dir, 'route-inventory.json'), 'utf8'));

// Union both suites: run-rest.js plus the gap suite.
const load = (f) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return { routeHits: [] }; }
};
const primary = load('rest-coverage.json');
const extra = load('rest-coverage-gaps.json');
const cov = {
  routeHits: [...(primary.routeHits || []), ...(extra.routeHits || [])],
  requested: primary.requested || [],
};

// Both sides already use ":name" templates produced by Express itself, so the
// only normalisation needed is collapsing differing param names to one token.
const tmpl = (p) => p.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':P');

const inventory = new Set(inv.routes.map((r) => `${r.method} ${tmpl(r.path)}`));
const hit = new Set(
  (cov.routeHits || []).filter((h) => h.matched && h.template).map((h) => `${h.method} ${tmpl(h.template)}`)
);

const covered = [...inventory].filter((k) => hit.has(k));
const gaps = [...inventory].filter((k) => !hit.has(k)).sort();

// Requests that matched NO route at all — dead links or stale client calls.
const unmatched = (cov.routeHits || []).filter((h) => !h.matched);

const tally = (arr) => arr.reduce((a, k) => { const m = k.split(' ')[0]; a[m] = (a[m] || 0) + 1; return a; }, {});

// A hit with no req.route is only a real gap if it also failed (404/5xx).
// Middleware-served successes (Swagger UI, static handlers) legitimately have no
// route object, and counting them as untested was a false positive.
const ok = (h) => h.statusCode >= 200 && h.statusCode < 300;
const unmatched404 = unmatched.filter((h) => !ok(h));
const servedByMiddleware = unmatched.filter(ok);

const md = [
  '# REST Coverage Gaps',
  '',
  `- Routes in app: ${inventory.size}`,
  `- Exercised by run-rest.js + run-rest-gaps.js: ${covered.length} (${(covered.length / inventory.size * 100).toFixed(1)}%)`,
  `- UNTESTED: ${gaps.length}`,
  '',
  '| by method | total | covered | untested |',
  '|---|---|---|---|',
  ...[...new Set([...inventory].map((k) => k.split(' ')[0]))].sort().map((m) => {
    const t = [...inventory].filter((k) => k.startsWith(`${m} `)).length;
    const c = covered.filter((k) => k.startsWith(`${m} `)).length;
    return `| ${m} | ${t} | ${c} | ${t - c} |`;
  }),
  '',
  '## Untested routes',
  '',
  ...(gaps.length ? gaps.map((k) => {
    const r = inv.routes.find((x) => `${x.method} ${tmpl(x.path)}` === k);
    return `- \`${k}\`  [guards: ${(r && r.guards.join(', ')) || 'none'}]`;
  }) : ['_none — every mounted route is exercised_']),
  '',
  '## Requests that fell through to an error (no route handled them)',
  '',
  '_Requests that matched no route and did not return a success. These are the',
  'only unmatched hits that indicate a real coverage gap._',
  '',
  ...(unmatched404.length
    ? [...new Set(unmatched404.map((h) => `${h.method} ${h.path || h.template || '(unknown)'} -> ${h.statusCode}`))]
        .map((x) => '- `' + x + '`')
    : ['_none_']),
  '',
  '## Requests served by middleware with no route',
  '',
  '_These matched no `req.route` but still returned a success, so they are not',
  'gaps (e.g. the Swagger UI is mounted as middleware rather than as a route)._',
  '',
  ...(servedByMiddleware.length
    ? [...new Set(servedByMiddleware.map((h) => `${h.method} ${h.path || h.template || '(unknown)'} -> ${h.statusCode}`))]
        .map((x) => '- `' + x + '`')
    : ['_none_']),
  '',
].join('\n');

fs.writeFileSync(path.join(dir, 'coverage-gaps.md'), md);
console.log(md);
console.log('tally inventory', JSON.stringify(tally([...inventory])));
console.log('tally covered  ', JSON.stringify(tally(covered)));
process.exit(0);
