const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'android/**', 'ios/**', 'coverage/**', 'scripts/**'],
  },
  {
    rules: {
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
];
