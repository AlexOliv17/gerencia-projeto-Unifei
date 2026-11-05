const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { resetDatabase } = require('../../src/db/database');
const { seed } = require('../../src/db/seed');

test('recriar o banco local de uma release anterior aplica o esquema novo (BUG-R2-01)', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-local-reset-'));
  const file = path.join(dir, 'arena-local.db');
  const old = new Database(file);
  old.exec(`CREATE TABLE championships (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE outbox (id INTEGER PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('password_reset')));`);
  old.close();

  const db = resetDatabase(file);
  t.after(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  seed(db);

  const columns = db.prepare('PRAGMA table_info(championships)').all().map((c) => c.name);
  assert.ok(columns.includes('allow_waitlist'));
  assert.doesNotThrow(() => db.prepare(`INSERT INTO outbox (type, recipient, subject, body, created_at)
    VALUES ('registration_result', 'a@b.c', 's', 'b', 'now')`).run());
});
