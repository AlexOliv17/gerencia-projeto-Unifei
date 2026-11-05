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

test('excluir a conta apaga as equipes e cancela as inscrições abertas, mesmo aprovadas', (t) => {
  const { anonymizeUser } = require('../../src/models/users');
  const db = seededDb(t);
  const maria = db.prepare("SELECT id FROM users WHERE email = 'capita@arenalocal.com'").get().id;
  anonymizeUser(db, maria);
  const teams = db.prepare('SELECT id, deleted_at FROM teams WHERE owner_id = ?').all(maria);
  assert.equal(teams.length, 2);
  assert.ok(teams.every((team) => team.deleted_at));
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM team_athletes WHERE team_id IN (${teams.map((x) => x.id).join(',')})`)
    .get().n, 0);
  const leoas = db.prepare("SELECT r.status FROM registrations r JOIN teams ON teams.id = r.team_id WHERE teams.name = 'Leoas da Serra'")
    .get();
  assert.equal(leoas.status, 'cancelled');
  const refused = db.prepare("SELECT status FROM registrations WHERE refuse_reason = 'Equipe incompleta'").get();
  assert.equal(refused.status, 'refused');
});

test('excluir a conta cancela as inscrições individuais abertas', (t) => {
  const { anonymizeUser } = require('../../src/models/users');
  const db = seededDb(t);
  const joao = db.prepare("SELECT id FROM users WHERE email = 'usuario@arenalocal.com'").get().id;
  anonymizeUser(db, joao);
  const statuses = db.prepare('SELECT status FROM registrations WHERE user_id = ?').all(joao).map((r) => r.status);
  assert.deepEqual(statuses, ['cancelled', 'cancelled']);
});
