module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'modules/**/*.js',
    '!modules/**/*.test.js',
  ],
  testMatch: ['**/test/**/*.test.js'],
  transform: {},
  extensionsToTreatAsEsm: ['.js'],
};
