const path = require('node:path');

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'arena-local.db'),
  sessionSecret: process.env.SESSION_SECRET || 'arena-local-dev-secret',
};
