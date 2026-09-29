/**
 * ESLint flat config for the Contech IoT Server.
 * Uses the logger, never console. Enforces Node + ES2020 syntax.
 */
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    files: ['**/*.js'],
    ignores: [
      'node_modules/**',
      'coverage/**',
      'logs/**',
      'mongodb/**',
      'test_all_endpoints.js',
      // Emitted by `adminjs build`; generated, minified and not ours to lint.
      '.adminjs/**'
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      // Enforce the logging system — never raw console calls
      'no-console': 'error',
      // Pre-existing dead variables & switch-case declarations are warnings
      // (not a hard gate); clean them up incrementally.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-case-declarations': 'warn',
      // Cleaner code
      'no-useless-catch': 'warn',
      'no-unreachable': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn'
    }
  },
  {
    // Entry-point scripts, maintenance scripts and the test suite are
    // command-line tools: they print human-readable results to the terminal and
    // are not long-running services, so routing that output through the
    // logger (structured records written to rotating files) would be wrong.
    // Only `no-console` is relaxed here — every other rule, including
    // `no-undef` and `no-empty`, still applies to these files.
    files: [
      'test/**/*.js',
      'test-*.js',
      'src/scripts/**/*.js',
      'start_server.js'
    ],
    rules: {
      'no-console': 'off'
    }
  }
];