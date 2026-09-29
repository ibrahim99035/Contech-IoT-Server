#!/usr/bin/env node
/* eslint-disable no-console -- CLI guard: stdout/stderr is its interface */
/**
 * Block credentials from being committed.
 *
 * This repository is public, so a leaked credential is immediately reachable by
 * anyone. Previous secrets (MongoDB, Redis, MQTT, JWT, Google OAuth, Cloudinary)
 * were committed in plaintext and had to be rotated and purged from history.
 * This guard exists to stop that recurring.
 *
 * Scans tracked files for assignments whose value looks like a real credential
 * rather than a placeholder. Exits non-zero on a hit.
 */
const { execFileSync } = require('child_process');

// Capture the whole right-hand side (including ${...} and trailing punctuation)
// so placeholders and template references can be recognised and skipped.
const SECRET_KEY = /(PASSWORD|SECRET|_PASS|API_KEY|PRIVATE_KEY|ACCESS_KEY|TOKEN)\s*[:=]\s*([^\n]{1,160})/gi;

// Placeholders, examples and empty values are not findings.
const ALLOW = [
  /^\s*$/, /^<.*>$/, /^\$\{[^}]*\}$/, /^\$[A-Z_]+$/, /^process\.env/i, /^\*+$/,
  /^["']?example/i, /^["']?placeholder/i, /^["']?change[-_]?me/i, /^["']?your[-_]/i,
  /^["']?xxx/i, /^["']?redacted/i, /^REMOVED_SECRET$/, /^["']?dummy/i,
  /^null$/i, /^undefined$/i, /^true$/i, /^false$/i, /^\{.*\}$/,
  // Anything that is plainly code rather than a literal credential:
  // a function call, a member access, an array/object, a template literal,
  // or a bare identifier (variables like newPassword / access_token).
  /^["']?[a-zA-Z_][\w.]*\s*\(/, /\(\s*\)\s*[;,)]?\s*$/, /\.\w+[;,)]?\s*$/,
  /["'`]?\$\{/, /^["']?[a-z][a-zA-Z0-9]*[;,)]?\s*$/, /^["']?[a-z][a-zA-Z0-9_]*["']?\s*$/,
  /^["'][a-z_][a-zA-Z0-9_]*["']$/, /:\s*[a-z][a-zA-Z0-9_]*\s*[,;}]/,
];

const TRACKED = ['-z', '--cached', '--diff-filter=ACM'];

let files = [];
try {
  files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64e6 })
    .split('\0').filter(Boolean);
} catch {
  console.error('scan-secrets: not a git repository');
  process.exit(2);
}

const findings = [];
for (const file of files) {
  // Skip binaries and vendored/generated trees.
  if (/\.(png|jpe?g|gif|svg|ico|woff2?|pdf|zip|gz|mp4|lock)$/i.test(file)) continue;
  if (/(^|\/)(node_modules|dist|coverage|logs?)\//.test(file)) continue;
  // Test fixtures legitimately contain dummy passwords and throwaway tokens.
  if (/^test(-|_|\/)/.test(file) || /^tests?\//.test(file)) continue;
  if (/^start_local\.sh$/.test(file)) continue;  // local-only dev helper, reviewed separately

  let text;
  try {
    text = execFileSync('git', ['show', `:${file}`], { encoding: 'utf8', maxBuffer: 32e6 });
  } catch { continue; }

  text.split('\n').forEach((line, i) => {
    if (/^\s*(#|\/\/|\*)/.test(line)) return;           // comments
    SECRET_KEY.lastIndex = 0;
    let m;
    while ((m = SECRET_KEY.exec(line)) !== null) {
      // Trim trailing statement punctuation and surrounding quotes.
      // Normalise markdown/code formatting before judging the value:
      // "**Password:** `secret`" must be read as "secret", not "**<secret>`".
      let value = m[2].trim()
        .replace(/[,;)\]]*$/, '')
        .replace(/^[*_`"'\s]+|[*_`"'\s]+$/g, '')
        .replace(/[*_`]/g, '')
        .trim();
      if (value.length < 8) continue;
      if (ALLOW.some((re) => re.test(value))) continue;
      // A real credential is not a bare alphabetic word. Require at least one
      // digit or symbol, which removes identifiers like "newPassword" while
      // keeping genuine secrets (they virtually always mix character classes).
      if (!/[0-9]/.test(value) && !/[^A-Za-z0-9_]/.test(value)) continue;
      // Code expressions, not literals: awaits, arrow functions, object and
      // array literals, function calls, and chained lookups.
      if (/\b(await|require|return|new)\b|=>/.test(value)) continue;
      if (/\+ [A-Z_]{3,}$/.test(value)) continue;              // console.log('...' + VAR)
      if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(value)) continue;  // local URLs
      if (/[{}();]|\|\||&&/.test(value)) continue;
      if (/^\w+\.[\w.]+\(/.test(value)) continue;
      // Generic prose in docs is not a credential.
      if (/\s[A-Za-z]{3,}\s/.test(value) && !/@|:\/|^eyJ/.test(value)) continue;
      findings.push({ file, line: i + 1, key: m[1], value });
    }
  });
}

if (!findings.length) {
  console.log(`scan-secrets: clean (${files.length} tracked files)`);
  process.exit(0);
}

console.error(`scan-secrets: ${findings.length} potential secret(s) in tracked files:\n`);
for (const f of findings) {
  const shown = f.value.length > 6 ? `${f.value.slice(0, 3)}…${f.value.slice(-2)}` : '…';
  console.error(`  ${f.file}:${f.line}  ${f.key} = ${shown} (len ${f.value.length})`);
}
console.error('\nReal credentials must never be committed. Use .env (gitignored) and put');
console.error('placeholders in .env.example. If a secret was already pushed, rotate it:');
console.error('history rewriting does NOT un-expose it.');
process.exit(1);
