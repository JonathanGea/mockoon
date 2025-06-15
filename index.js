const { startEnvironments } = require('@mockoon/cli');

startEnvironments({
  data: ['./mockoon-environment.json'],
  port: 3000
});
