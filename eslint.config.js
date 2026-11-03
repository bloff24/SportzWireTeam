// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'supabase/*'],
  },
  {
    // Screens load data in effects (fetch, then setState); keep this as a hint, not a failure.
    rules: { 'react-hooks/set-state-in-effect': 'warn' },
  },
]);
