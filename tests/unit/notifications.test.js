const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../../src/db/database');
const { seed } = require('../../src/db/seed');
const { notify, savePreferences, unreadCount } = require('../../src/models/notifications');
const { follow } = require('../../src/models/follows');
const { anonymizeUser } = require('../../src/models/users');

function seededDb(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-local-unit-'));
  const db = openDatabase(path.join(dir, 'test.db'));
  t.after(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  seed(db);
  return db;
}

const idOf = (db, email) => db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
const notices = (db, userId) => db.prepare('SELECT title FROM notifications WHERE user_id = ?').all(userId).map((r) => r.title);
const message = (extra = {}) => ({ type: 'schedule_changed', outboxType: 'championship_changed', title: 'Aviso', body: 'Texto', ...extra });

test('cada pessoa recebe o aviso uma vez, com e-mail simulado na caixa de saída', (t) => {
  const db = seededDb(t);
  const joao = idOf(db, 'usuario@arenalocal.com');
  assert.equal(notify(db, message({ userIds: [joao, joao, null] })), 1);
  assert.deepEqual(notices(db, joao), ['Aviso']);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE recipient = 'usuario@arenalocal.com'").get().n, 1);
});

test('lembrete com a mesma chave não repete', (t) => {
  const db = seededDb(t);
  const joao = idOf(db, 'usuario@arenalocal.com');
  assert.equal(notify(db, message({ userIds: [joao], type: 'match_upcoming', outboxType: 'match_upcoming', dedupeKey: 'jogo:1:24h' })), 1);
  assert.equal(notify(db, message({ userIds: [joao], type: 'match_upcoming', outboxType: 'match_upcoming', dedupeKey: 'jogo:1:24h' })), 0);
  assert.equal(notices(db, joao).length, 1);
});

test('não avisa quem fez a alteração, quem desligou o tipo nem conta excluída', (t) => {
  const db = seededDb(t);
  const [joao, maria, carlos] = ['usuario@arenalocal.com', 'capita@arenalocal.com', 'organizador@arenalocal.com'].map((e) => idOf(db, e));
  savePreferences(db, maria, new Set(['match_upcoming']));
  const removed = idOf(db, 'pendente@arenalocal.com');
  anonymizeUser(db, removed);
  const sent = notify(db, message({ userIds: [joao, maria, carlos, removed], exceptUserId: carlos }));
  assert.equal(sent, 1);
  assert.deepEqual(notices(db, joao), ['Aviso']);
  assert.equal(notices(db, maria).filter((x) => x === 'Aviso').length, 0);
  assert.equal(unreadCount(db, joao), 1);
});

test('excluir a conta apaga seguidos, avisos e preferências', (t) => {
  const db = seededDb(t);
  const joao = idOf(db, 'usuario@arenalocal.com');
  follow(db, joao, { championshipId: 1 });
  follow(db, joao, { championshipId: 1 });
  notify(db, message({ userIds: [joao] }));
  savePreferences(db, joao, new Set());
  anonymizeUser(db, joao);
  for (const table of ['follows', 'notifications', 'notification_preferences']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(joao).n, 0, table);
  }
});

test('seguir o mesmo campeonato duas vezes guarda um registro só', (t) => {
  const db = seededDb(t);
  const maria = idOf(db, 'capita@arenalocal.com');
  follow(db, maria, { championshipId: 2 });
  follow(db, maria, { championshipId: 2 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM follows WHERE user_id = ? AND championship_id = 2').get(maria).n, 1);
});
