const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { createUser } = require('../../src/models/users');
const { createChampionship } = require('../../src/models/championships');
const { createTeam } = require('../../src/models/teams');
const { createRegistration, cancelRegistration } = require('../../src/models/registrations');
const { addDaysIso, todayIso } = require('../../src/validation/dates');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  visit, fill, selectByText, submit, click, flash, fieldError, text, texts, exists, login, logout, forgePost,
} = require('./support/ui');

const inDays = (n) => addDaysIso(todayIso(), n);
const ORGANIZER = 'organizador@arenalocal.com';
const JOAO = 'usuario@arenalocal.com';
const MARIA = 'capita@arenalocal.com';

describe('RFS16 - Analisar Inscrição', function () {
  let server;
  let driver;

  const db = () => server.db;
  const userId = (email) => db().prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  const teamId = (name) => db().prepare('SELECT id FROM teams WHERE name = ?').get(name).id;
  const champId = (name) => db().prepare('SELECT id FROM championships WHERE name = ?').get(name).id;
  const categoryId = (champ, name) => db().prepare(`SELECT cc.id FROM championship_categories cc
    JOIN championships c ON c.id = cc.championship_id WHERE c.name = ? AND cc.name = ?`).get(champ, name).id;
  const registrationId = (champ, team) => db().prepare('SELECT id FROM registrations WHERE championship_id = ? AND team_id = ?')
    .get(champId(champ), teamId(team)).id;
  const statusOf = (id) => db().prepare('SELECT status FROM registrations WHERE id = ?').get(id).status;

  function championship(name, overrides = {}, owner = ORGANIZER) {
    return createChampionship(db(), userId(owner), {
      name, sport: 'futsal', categories: ['Única'], cityId: 1, venue: 'Quadra', startDate: inDays(30),
      endDate: inDays(31), registrationDeadline: inDays(20), format: 'knockout', maxSlots: null, rules: null,
      contact: null, allowWaitlist: false, ...overrides,
    });
  }

  function register(champ, category, team, email, status) {
    return createRegistration(db(), {
      championshipId: champId(champ), categoryId: categoryId(champ, category), teamId: teamId(team),
      userId: userId(email), status,
    });
  }

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    championship('Copa Uma Vaga', { maxSlots: 1, allowWaitlist: true });
    register('Copa Uma Vaga', 'Única', 'Leoas da Serra', MARIA, 'approved');
    register('Copa Uma Vaga', 'Única', 'Unidos de Itajubá', JOAO, 'waitlist');
    championship('Copa Recusa');
    register('Copa Recusa', 'Única', 'Unidos de Itajubá', JOAO, 'pending');
    const joao = db().prepare('SELECT id, city_id FROM users WHERE email = ?').get(JOAO);
    createTeam(db(), joao.id, { name: 'Futebol FC', sport: 'football', cityId: joao.city_id, athletes: [{ name: 'Zé', number: '9' }] });
    register('Torneio de Futebol de Verão', 'Adulto', 'Futebol FC', JOAO, 'pending');
    createUser(db(), {
      name: 'Olga Outra', email: 'outro@exemplo.com', password: 'Senha@123', cityId: 1,
      role: 'organizer', status: 'active', document: '98765432100', leagueName: 'Liga da Serra',
    });
    championship('Copa da Pendente', {}, 'pendente@arenalocal.com');
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  const entries = () => texts(driver, 'tr[data-testid="review-row"] .entry');
  const reviewPath = (champ) => `/my/championships/${champId(champ)}/registrations`;

  async function review(champ, email = ORGANIZER) {
    await login(driver, server.baseUrl, email, 'Senha@123');
    await visit(driver, server.baseUrl, reviewPath(champ));
  }

  it('lista as inscrições do campeonato com filtros', async function () {
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/championships');
    await click(driver, `#registrations-${champId('Copa Itajubá de Futsal')}`);
    assert.deepEqual((await entries()).sort(), ['Leoas da Serra', 'Unidos de Itajubá']);
    assert.equal(await text(driver, `#slots-${categoryId('Copa Itajubá de Futsal', 'Adulto')} .count`), '1/16');
    await selectByText(driver, 'status', 'Pendente');
    await click(driver, '#filter-submit');
    assert.deepEqual(await entries(), ['Unidos de Itajubá']);
    await selectByText(driver, 'status', 'Todos');
    await selectByText(driver, 'category_id', 'Sub-17');
    await click(driver, '#filter-submit');
    assert.equal(await exists(driver, '#no-registrations'), true);
  });

  it('aprova inscrição pendente e avisa o responsável', async function () {
    const id = registrationId('Copa Itajubá de Futsal', 'Unidos de Itajubá');
    await review('Copa Itajubá de Futsal');
    await click(driver, `#approve-${id}`);
    assert.equal(await flash(driver), 'Inscrição aprovada.');
    assert.equal(statusOf(id), 'approved');
    const mail = db().prepare("SELECT * FROM outbox WHERE type = 'registration_result'").all();
    assert.equal(mail.length, 1);
    assert.equal(mail[0].recipient, JOAO);
    assert.equal(mail[0].subject, 'Inscrição aprovada — Copa Itajubá de Futsal');
    await logout(driver);
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/registrations');
    assert.equal(await text(driver, `#registration-${id} .status`), 'Aprovada');
  });

  it('recusa exige justificativa', async function () {
    const id = registrationId('Copa Recusa', 'Unidos de Itajubá');
    await review('Copa Recusa');
    await click(driver, `#refuse-${id}`);
    await click(driver, '#confirm-refuse');
    assert.equal(await fieldError(driver, 'reason'), MESSAGES.refuseReasonRequired);
    assert.equal(statusOf(id), 'pending');
  });

  it('recusa com justificativa e o usuário vê o motivo', async function () {
    const id = registrationId('Copa Recusa', 'Unidos de Itajubá');
    await review('Copa Recusa');
    await click(driver, `#refuse-${id}`);
    await fill(driver, { reason: 'Documentação incompleta' });
    await click(driver, '#confirm-refuse');
    assert.equal(await flash(driver), 'Inscrição recusada.');
    assert.equal(await text(driver, `#review-${id} .status`), 'Recusada');
    const mail = db().prepare("SELECT body FROM outbox WHERE subject = 'Inscrição recusada — Copa Recusa'").get();
    assert.match(mail.body, /Documentação incompleta/);
    await logout(driver);
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/registrations');
    assert.equal(await text(driver, `#registration-${id} .reason`), 'Documentação incompleta');
  });

  it('não aprova além das vagas', async function () {
    const id = registrationId('Copa Uma Vaga', 'Unidos de Itajubá');
    await review('Copa Uma Vaga');
    await click(driver, `#approve-${id}`);
    assert.equal(await flash(driver), MESSAGES.registrationNoSlots);
    assert.equal(statusOf(id), 'waitlist');
  });

  it('aprova da lista de espera quando abre vaga', async function () {
    cancelRegistration(db(), registrationId('Copa Uma Vaga', 'Leoas da Serra'));
    const id = registrationId('Copa Uma Vaga', 'Unidos de Itajubá');
    await review('Copa Uma Vaga');
    await click(driver, `#approve-${id}`);
    assert.equal(statusOf(id), 'approved');
  });

  it('campeonato encerrado só permite consulta', async function () {
    const id = registrationId('Torneio de Futebol de Verão', 'Futebol FC');
    await review('Torneio de Futebol de Verão');
    assert.deepEqual(await entries(), ['Futebol FC']);
    assert.equal(await exists(driver, `#approve-${id}`), false);
    assert.equal(await exists(driver, `#refuse-${id}`), false);
    await forgePost(driver, `/registrations/${id}/approve`);
    assert.equal(await flash(driver), MESSAGES.registrationReviewClosed);
    assert.equal(statusOf(id), 'pending');
  });

  it('outro organizador não analisa', async function () {
    const id = registrationId('Copa Recusa', 'Unidos de Itajubá');
    await login(driver, server.baseUrl, 'outro@exemplo.com', 'Senha@123');
    await visit(driver, server.baseUrl, reviewPath('Copa Itajubá de Futsal'));
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    await forgePost(driver, `/registrations/${registrationId('Copa Uma Vaga', 'Leoas da Serra')}/approve`);
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    assert.equal(statusOf(registrationId('Copa Uma Vaga', 'Leoas da Serra')), 'cancelled');
    await forgePost(driver, `/registrations/${id}/refuse`, { reason: 'tentativa' });
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    assert.equal(statusOf(id), 'refused');
  });

  it('organizador pendente não analisa', async function () {
    await review('Copa da Pendente', 'pendente@arenalocal.com');
    assert.equal(await text(driver, 'h1'), 'Cadastro em validação');
  });

  it('usuário comum não acessa a análise', async function () {
    await review('Copa Itajubá de Futsal', JOAO);
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
  });
});
