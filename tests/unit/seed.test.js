const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../../src/db/database');
const { seed } = require('../../src/db/seed');

function seededDb(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-local-unit-'));
  const db = openDatabase(path.join(dir, 'test.db'));
  t.after(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  seed(db);
  seed(db);
  return db;
}

test('seed cria equipes, atletas e inscrições de exemplo (e pode rodar de novo)', (t) => {
  const db = seededDb(t);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teams').get().n, 3);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM team_athletes').get().n, 18);
  const statuses = db.prepare('SELECT status FROM registrations ORDER BY status').all().map((r) => r.status);
  assert.deepEqual(statuses, ['approved', 'pending', 'pending', 'refused']);
  assert.equal(db.prepare("SELECT refuse_reason FROM registrations WHERE status = 'refused'").get().refuse_reason,
    'Equipe incompleta');
  assert.ok(db.prepare("SELECT 1 FROM users WHERE email = 'capita@arenalocal.com'").get());
});
