export default {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'modules/**/*.js',
    '!modules/**/*.test.js',
  ],
  testMatch: ['**/test/**/*.test.js'],
};
