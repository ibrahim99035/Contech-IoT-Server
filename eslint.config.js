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
      'test_all_endpoints.js'
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
  }
];