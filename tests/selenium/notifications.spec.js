const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { formatBrDate } = require('../../src/validation/dates');
const { runReminders } = require('../../src/models/reminders');
const { follow } = require('../../src/models/follows');
const { startOf, deadlineEnd } = require('../../src/rules/reminders');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const { fixtures } = require('./support/fixtures');
const {
  visit, fill, click, submit, flash, text, texts, exists, login, logout,
} = require('./support/ui');

const ORGANIZER = 'organizador@arenalocal.com';
const JOAO = 'usuario@arenalocal.com';
const MARIA = 'capita@arenalocal.com';
const HOUR = 60 * 60 * 1000;

describe('RFS18 - Enviar Avisos Automáticos', function () {
  let server;
  let driver;
  let f;

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    f = fixtures(server.db);
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  const titlesFor = (email) => server.db.prepare(`SELECT n.title FROM notifications n JOIN users u ON u.id = n.user_id
    WHERE u.email = ? ORDER BY n.id`).all(email).map((r) => r.title);
  const mailTo = (email, subject) => server.db.prepare('SELECT * FROM outbox WHERE recipient = ? AND subject = ?').all(email, subject);
  const game = (round) => server.db.prepare('SELECT * FROM matches WHERE round = ?').get(round);

  it('alterar a data do campeonato avisa seguidores e inscritos, mas não quem alterou', async function () {
    const copa = f.champId('Copa Itajubá de Futsal');
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, `/my/championships/${copa}/edit`);
    const start = server.db.prepare('SELECT start_date FROM championships WHERE id = ?').get(copa).start_date;
    await fill(driver, { start_date: formatBrDate(f.inDays(21)) });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.champSaved);
    assert.notEqual(start, f.inDays(21));
    const subject = 'Alteração no campeonato Copa Itajubá de Futsal';
    assert.deepEqual(titlesFor(JOAO).filter((t) => t === subject), [subject], 'João tem inscrição pendente');
    assert.deepEqual(titlesFor(MARIA).filter((t) => t === subject), [subject], 'Maria segue e tem inscrição: um aviso só');
    assert.deepEqual(titlesFor(ORGANIZER), []);
    assert.equal(mailTo(JOAO, subject).length, 1);
    assert.equal(mailTo(MARIA, subject).length, 1);
  });

  it('Meus avisos mostra o aviso novo, o contador some depois de abrir', async function () {
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    const unread = Number(await text(driver, '#unread-count'));
    assert.ok(unread >= 1, `não lidos: ${unread}`);
    await click(driver, '#nav-notifications');
    const titles = await texts(driver, 'li[data-testid="notification"] .title');
    assert.equal(titles[0], 'Alteração no campeonato Copa Itajubá de Futsal');
    assert.equal(await text(driver, 'li[data-testid="notification"] .new'), 'Novo');
    await visit(driver, server.baseUrl, '/my/notifications');
    assert.equal(await exists(driver, '#unread-count'), false);
    assert.equal(await exists(driver, 'li[data-testid="notification"] .new'), false);
  });

  it('reagendar e cancelar jogo avisa responsáveis e seguidores da equipe e do campeonato', async function () {
    const round3 = game('Rodada 3');
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, `/games/${round3.id}/edit`);
    await fill(driver, { start_time: '20:30' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.matchSaved);
    const changed = 'Jogo reagendado: Garças do Sapucaí x Estrelas do Vale';
    assert.ok(titlesFor(MARIA).includes(changed), 'Maria é a responsável pelas equipes');
    assert.ok(titlesFor(JOAO).includes(changed), 'João segue a Liga de Vôlei');

    await visit(driver, server.baseUrl, `/games/${round3.id}/cancel`);
    await click(driver, '#confirm-cancel');
    const cancelled = 'Jogo cancelado: Garças do Sapucaí x Estrelas do Vale';
    assert.ok(titlesFor(MARIA).includes(cancelled));
    assert.ok(titlesFor(JOAO).includes(cancelled));
  });

  it('aprovar a inscrição avisa quem pediu', async function () {
    const copa = f.champId('Copa Itajubá de Futsal');
    const unidos = server.db.prepare('SELECT id FROM registrations WHERE championship_id = ? AND team_id = ?')
      .get(copa, f.teamId('Unidos de Itajubá')).id;
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, `/my/championships/${copa}/registrations`);
    await click(driver, `#approve-${unidos}`);
    assert.ok(titlesFor(JOAO).includes('Inscrição aprovada — Copa Itajubá de Futsal'));
    assert.equal(mailTo(JOAO, 'Inscrição aprovada — Copa Itajubá de Futsal').length, 1);
  });

  it('quem desliga um tipo de aviso deixa de recebê-lo', async function () {
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/notifications');
    await click(driver, '#notification-preferences');
    await (await driver.findElement({ css: '#schedule_changed' })).click(); // a checkbox: no page change
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.preferencesSaved);
    assert.equal(await (await driver.findElement({ css: '#schedule_changed' })).isSelected(), false);
    await logout(driver);

    const subject = 'Alteração no campeonato Copa Itajubá de Futsal';
    const before = { joao: titlesFor(JOAO).filter((t) => t === subject).length, maria: titlesFor(MARIA).filter((t) => t === subject).length };
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, `/my/championships/${f.champId('Copa Itajubá de Futsal')}/edit`);
    await fill(driver, { venue: 'Ginásio Poliesportivo' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.champSaved);
    assert.equal(titlesFor(JOAO).filter((t) => t === subject).length, before.joao, 'João desligou o tipo');
    assert.equal(titlesFor(MARIA).filter((t) => t === subject).length, before.maria + 1, 'Maria continua recebendo');
  });

  it('cancelar e depois remarcar a largada avisa os dois momentos (BUG-R4-01)', async function () {
    const corrida = 'Corrida Rústica de Pouso Alegre';
    // Maria: João switched "alteração" notices off in an earlier test of this file.
    follow(server.db, f.userId(MARIA), { championshipId: f.champId(corrida) });
    const path = `/my/championships/${f.champId(corrida)}/races/${f.categoryId(corrida, '10 km')}`;
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, `${path}/cancel`);
    await click(driver, '#confirm-cancel');
    assert.ok(titlesFor(MARIA).includes(`Largada cancelada: ${corrida} (10 km)`));
    await visit(driver, server.baseUrl, `${path}/start`);
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.raceSaved);
    assert.ok(titlesFor(MARIA).includes(`Largada remarcada: ${corrida} (10 km)`));
  });

  it('lembretes de 24 h e 2 h saem uma vez só, mesmo com a rotina rodando de novo', async function () {
    const liga = f.champId('Liga de Vôlei Santa Rita');
    const [a, b] = server.db.prepare('SELECT id FROM registrations WHERE championship_id = ? AND status = ? ORDER BY id LIMIT 2')
      .all(liga, 'approved').map((r) => r.id);
    const id = f.game('Liga de Vôlei Santa Rita', a, b, { category: 'Feminino', day: 1, time: '21:00', round: 'Rodada 4', venue: 'Quadra Nova' });
    const start = startOf(f.inDays(1), '21:00');
    const title24 = 'Jogo em 24 horas: Estrelas do Vale x Ases de Santa Rita';
    const title2 = 'Jogo em 2 horas: Estrelas do Vale x Ases de Santa Rita';

    runReminders(server.db, new Date(start.getTime() - 30 * HOUR));
    assert.equal(titlesFor(JOAO).filter((t) => t === title24).length, 0, 'ainda fora da janela');
    runReminders(server.db, new Date(start.getTime() - 20 * HOUR));
    runReminders(server.db, new Date(start.getTime() - 19 * HOUR));
    assert.equal(titlesFor(JOAO).filter((t) => t === title24).length, 1);
    assert.equal(titlesFor(MARIA).filter((t) => t === title24).length, 1);
    runReminders(server.db, new Date(start.getTime() - 1 * HOUR));
    runReminders(server.db, new Date(start.getTime() - 0.5 * HOUR));
    assert.equal(titlesFor(JOAO).filter((t) => t === title2).length, 1);
    assert.ok(id);
  });

  it('lembrete de fim das inscrições só para quem segue o campeonato', async function () {
    const copa = server.db.prepare("SELECT registration_deadline FROM championships WHERE name = 'Copa Itajubá de Futsal'").get();
    runReminders(server.db, new Date(deadlineEnd(copa.registration_deadline).getTime() - 24 * HOUR));
    assert.ok(titlesFor(MARIA).includes('Inscrições terminando: Copa Itajubá de Futsal'));
    assert.equal(titlesFor(JOAO).includes('Inscrições terminando: Copa Itajubá de Futsal'), false);
  });
});
