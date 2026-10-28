const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { createUser } = require('../../src/models/users');
const { createChampionship } = require('../../src/models/championships');
const { addDaysIso, todayIso, formatBrDate } = require('../../src/validation/dates');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  visit, fill, selectByText, submit, click, flash, fieldError, text, texts, exists, value, login, logout, forgePost,
} = require('./support/ui');

const inDays = (n) => addDaysIso(todayIso(), n);

describe('RFS06/RFS07/RFS08 - Gerenciar campeonatos', function () {
  let server;
  let driver;

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    const cityId = server.db.prepare("SELECT id FROM cities WHERE name = 'Maria da Fé'").get().id;
    const otherId = createUser(server.db, {
      name: 'Olga Outra', email: 'outro@exemplo.com', password: 'Senha@123', cityId,
      role: 'organizer', status: 'active', document: '98765432100', leagueName: 'Liga da Serra',
    });
    createChampionship(server.db, otherId, {
      name: 'Copa do Outro', sport: 'football', categories: ['Livre'], cityId, venue: 'Campo da Serra',
      startDate: inDays(50), endDate: inDays(52), registrationDeadline: inDays(45), format: 'knockout',
      maxSlots: null, rules: null, contact: null,
    });
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  const idOf = (name) => server.db.prepare('SELECT id FROM championships WHERE name = ?').get(name).id;
  const outbox = (subject) => server.db.prepare('SELECT * FROM outbox WHERE subject = ?').all(subject);
  const listedNames = () => texts(driver, 'tr[data-testid="championship-row"] .name');

  async function asOrganizer(path = '/my/championships', email = 'organizador@arenalocal.com') {
    await login(driver, server.baseUrl, email, 'Senha@123');
    await visit(driver, server.baseUrl, path);
  }

  it('lista só os campeonatos do organizador', async function () {
    await asOrganizer();
    const names = await listedNames();
    assert.equal(names.includes('Copa do Outro'), false);
    assert.equal(names.length, 5);
  });

  it('filtra por status', async function () {
    await asOrganizer();
    await selectByText(driver, 'status', 'Em inscrição');
    await click(driver, '#filter-submit');
    assert.deepEqual(await listedNames(), ['Copa Itajubá de Futsal', 'Corrida Rústica de Pouso Alegre']);
    assert.deepEqual(await texts(driver, 'tr[data-testid="championship-row"] .status'), ['Em inscrição', 'Em inscrição']);
  });

  it('filtra por modalidade', async function () {
    await asOrganizer();
    await selectByText(driver, 'sport', 'Vôlei');
    await click(driver, '#filter-submit');
    assert.deepEqual(await listedNames(), ['Liga de Vôlei Santa Rita']);
  });

  it('filtra por período de realização', async function () {
    await asOrganizer();
    await fill(driver, { date_from: formatBrDate(inDays(31)), date_to: formatBrDate(inDays(35)) });
    await click(driver, '#filter-submit');
    assert.deepEqual(await listedNames(), ['Copa Itajubá de Futsal']);
  });

  it('abre a alteração com os dados atuais', async function () {
    await asOrganizer(`/my/championships/${idOf('Copa Itajubá de Futsal')}/edit`);
    assert.equal(await value(driver, 'categories'), 'Adulto, Sub-17');
    assert.equal(await value(driver, 'start_date'), formatBrDate(inDays(20)));
  });

  it('altera o local e registra aviso aos inscritos', async function () {
    await asOrganizer();
    await click(driver, `#edit-${idOf('Copa Itajubá de Futsal')}`);
    await fill(driver, { venue: 'Ginásio Poliesportivo' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.champSaved);
    assert.equal(server.db.prepare('SELECT venue FROM championships WHERE id = ?').get(idOf('Copa Itajubá de Futsal')).venue,
      'Ginásio Poliesportivo');
    assert.equal(outbox('Alteração no campeonato Copa Itajubá de Futsal').length, 1);
  });

  it('alteração sem mudar data ou local não gera aviso', async function () {
    await asOrganizer(`/my/championships/${idOf('Copa Itajubá de Futsal')}/edit`);
    await fill(driver, { rules: 'Regulamento revisado.' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.champSaved);
    assert.equal(outbox('Alteração no campeonato Copa Itajubá de Futsal').length, 1);
  });

  it('valida as regras também na alteração', async function () {
    await asOrganizer(`/my/championships/${idOf('Copa Itajubá de Futsal')}/edit`);
    await fill(driver, { registration_deadline: formatBrDate(inDays(21)) });
    await submit(driver);
    assert.equal(await fieldError(driver, 'registration_deadline'), MESSAGES.deadlineAfterStart);
  });

  it('encerra campeonato', async function () {
    const id = idOf('Liga de Vôlei Santa Rita');
    await asOrganizer();
    await click(driver, `#finish-${id}`);
    await click(driver, '#confirm-finish');
    assert.equal(await flash(driver), MESSAGES.champFinished);
    await selectByText(driver, 'sport', 'Vôlei');
    await click(driver, '#filter-submit');
    assert.equal(await text(driver, 'tr[data-testid="championship-row"] .status'), 'Encerrado');
    assert.equal(await exists(driver, `#edit-${id}`), false);
  });

  it('cancelamento exige justificativa', async function () {
    await asOrganizer();
    await click(driver, `#cancel-${idOf('Corrida Rústica de Pouso Alegre')}`);
    await click(driver, '#confirm-cancel');
    assert.equal(await fieldError(driver, 'reason'), MESSAGES.cancelReasonRequired);
  });

  it('cancela com justificativa e registra aviso', async function () {
    await asOrganizer();
    await click(driver, `#cancel-${idOf('Corrida Rústica de Pouso Alegre')}`);
    await fill(driver, { reason: 'Obras na avenida' });
    await click(driver, '#confirm-cancel');
    assert.equal(await flash(driver), MESSAGES.champCancelled);
    const row = server.db.prepare("SELECT status, cancel_reason FROM championships WHERE name = 'Corrida Rústica de Pouso Alegre'").get();
    assert.deepEqual(row, { status: 'cancelled', cancel_reason: 'Obras na avenida' });
    assert.equal(outbox('Campeonato Corrida Rústica de Pouso Alegre cancelado').length, 1);
  });

  it('não permite alterar campeonato encerrado', async function () {
    await asOrganizer(`/my/championships/${idOf('Torneio de Futebol de Verão')}/edit`);
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
  });

  it('outro organizador não altera nem cancela', async function () {
    const id = idOf('Copa Itajubá de Futsal');
    await asOrganizer(`/my/championships/${id}/edit`, 'outro@exemplo.com');
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    await visit(driver, server.baseUrl, `/championships/${id}/cancel`);
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
  });

  it('outro organizador não altera nem cancela com POST forjado', async function () {
    const id = idOf('Copa Itajubá de Futsal');
    const before = server.db.prepare('SELECT name, status FROM championships WHERE id = ?').get(id);
    await asOrganizer('/my/championships', 'outro@exemplo.com');
    await forgePost(driver, `/my/championships/${id}/edit`, { name: 'Invadido', sport: 'futsal' });
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    await forgePost(driver, `/championships/${id}/cancel`, { reason: 'invasão' });
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    assert.deepEqual(server.db.prepare('SELECT name, status FROM championships WHERE id = ?').get(id), before);
  });

  it('organizador que volta a pendente não gerencia mais seus campeonatos (Mantis #3)', async function () {
    const id = idOf('Copa Itajubá de Futsal');
    const setStatus = (status) => server.db.prepare("UPDATE users SET status = ? WHERE email = 'organizador@arenalocal.com'")
      .run(status);
    setStatus('pending');
    try {
      await asOrganizer();
      assert.equal(await exists(driver, `#edit-${id}`), false);
      await visit(driver, server.baseUrl, `/my/championships/${id}/edit`);
      assert.equal(await text(driver, '#pending-block'), MESSAGES.pendingBlock);
      await forgePost(driver, `/championships/${id}/cancel`, { reason: 'tentativa' });
      assert.equal(await text(driver, '#pending-block'), MESSAGES.pendingBlock);
      assert.equal(server.db.prepare('SELECT status FROM championships WHERE id = ?').get(id).status, 'active');
    } finally {
      setStatus('active');
    }
  });

  it('id inexistente responde página não encontrada', async function () {
    await asOrganizer('/my/championships/9999/edit');
    assert.equal(await text(driver, 'h1'), 'Página não encontrada');
  });

  it('admin vê todos os campeonatos e cancela o de outro organizador', async function () {
    await login(driver, server.baseUrl, 'admin@arenalocal.com', 'Admin@123');
    await visit(driver, server.baseUrl, '/admin/championships');
    assert.ok((await listedNames()).includes('Copa do Outro'));
    await click(driver, `#cancel-${idOf('Copa do Outro')}`);
    await fill(driver, { reason: 'Informações falsas' });
    await click(driver, '#confirm-cancel');
    assert.equal(await flash(driver), MESSAGES.champCancelled);
    assert.match(await driver.getCurrentUrl(), /\/admin\/championships$/);
  });
});
