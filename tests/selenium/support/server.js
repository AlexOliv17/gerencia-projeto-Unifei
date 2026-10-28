const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../../../src/db/database');
const { seed } = require('../../../src/db/seed');
const { createApp } = require('../../../src/app');

/** Starts the app in-process on a random port with a fresh, seeded temporary database. */
async function startTestServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-local-'));
  const db = openDatabase(path.join(dir, 'test.db'));
  seed(db);
  const app = createApp({ db });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function close() {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return { baseUrl, db, close };
}

module.exports = { startTestServer };
