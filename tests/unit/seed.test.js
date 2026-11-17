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
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teams').get().n, 6);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM team_athletes').get().n, 36);
  const statuses = db.prepare('SELECT status FROM registrations ORDER BY status').all().map((r) => r.status);
  assert.deepEqual(statuses, ['approved', 'approved', 'approved', 'approved', 'pending', 'pending', 'refused']);
  assert.equal(db.prepare("SELECT refuse_reason FROM registrations WHERE status = 'refused'").get().refuse_reason,
    'Equipe incompleta');
  assert.ok(db.prepare("SELECT 1 FROM users WHERE email = 'capita@arenalocal.com'").get());
});

test('seed traz a Liga de Vôlei com jogos e resultados, e as largadas da corrida', (t) => {
  const db = seededDb(t);
  const matches = db.prepare('SELECT round, score_a, score_b, result_updated_by FROM matches ORDER BY round_number').all();
  assert.deepEqual(matches.map((m) => [m.round, m.score_a, m.score_b]), [['Rodada 1', 3, 1], ['Rodada 2', 3, 2], ['Rodada 3', null, null]]);
  assert.ok(matches[0].result_updated_by);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM result_history').get().n, 2);
  const starts = db.prepare('SELECT start_time FROM race_starts ORDER BY start_time').all().map((r) => r.start_time);
  assert.deepEqual(starts, ['07:00', '07:30']);
});

test('excluir a conta apaga as equipes e cancela as inscrições abertas, mesmo aprovadas', (t) => {
  const { anonymizeUser } = require('../../src/models/users');
  const db = seededDb(t);
  const maria = db.prepare("SELECT id FROM users WHERE email = 'capita@arenalocal.com'").get().id;
  anonymizeUser(db, maria);
  const teams = db.prepare('SELECT id, deleted_at FROM teams WHERE owner_id = ?').all(maria);
  assert.equal(teams.length, 5);
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
