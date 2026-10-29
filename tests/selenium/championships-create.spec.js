const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { addDaysIso, todayIso, formatBrDate } = require('../../src/validation/dates');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  visit, fill, selectByText, submit, flash, fieldError, text, exists, value, login, logout,
} = require('./support/ui');

const inDays = (n) => formatBrDate(addDaysIso(todayIso(), n));

describe('RFS05 - Cadastrar Campeonato', function () {
  let server;
  let driver;

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  async function openForm(email = 'organizador@arenalocal.com') {
    await login(driver, server.baseUrl, email, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/championships/new');
  }

  async function fillChampionship(overrides = {}) {
    const v = {
      name: 'Copa Teste de Vôlei',
      sport: 'Vôlei',
      categories: 'Adulto, Sub-20',
      city: 'Itajubá',
      venue: 'Ginásio Teste',
      start_date: inDays(40),
      end_date: inDays(45),
      registration_deadline: inDays(30),
      format: 'Pontos corridos',
      max_slots: '12',
      ...overrides,
    };
    await fill(driver, {
      name: v.name,
      categories: v.categories,
      venue: v.venue,
      start_date: v.start_date,
      end_date: v.end_date,
      registration_deadline: v.registration_deadline,
      max_slots: v.max_slots,
      rules: 'Jogos aos sábados.',
      contact: '(35) 98888-0000',
    });
    await selectByText(driver, 'sport', v.sport);
    await selectByText(driver, 'city_id', v.city);
    await selectByText(driver, 'format', v.format);
  }

  it('organizador ativo cadastra campeonato válido', async function () {
    await openForm();
    await fillChampionship();
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.champCreated);
    assert.match(await driver.getCurrentUrl(), /\/my\/championships$/);
    const row = server.db.prepare("SELECT * FROM championships WHERE name = 'Copa Teste de Vôlei'").get();
    assert.equal(row.sport, 'volleyball');
    assert.equal(row.start_date, addDaysIso(todayIso(), 40));
    assert.equal(row.max_slots, 12);
    const categories = server.db.prepare('SELECT name FROM championship_categories WHERE championship_id = ? ORDER BY id')
      .all(row.id).map((c) => c.name);
    assert.deepEqual(categories, ['Adulto', 'Sub-20']);
  });

  it('rejeita término antes do início e mantém os dados', async function () {
    await openForm();
    await fillChampionship({ name: 'Copa Datas', end_date: inDays(39) });
    await submit(driver);
    assert.equal(await fieldError(driver, 'end_date'), MESSAGES.endBeforeStart);
    assert.equal(await value(driver, 'name'), 'Copa Datas');
    assert.equal(await value(driver, 'categories'), 'Adulto, Sub-20');
  });

  it('rejeita prazo de inscrição após o início', async function () {
    await openForm();
    await fillChampionship({ registration_deadline: inDays(41) });
    await submit(driver);
    assert.equal(await fieldError(driver, 'registration_deadline'), MESSAGES.deadlineAfterStart);
  });

  it('rejeita data inexistente', async function () {
    await openForm();
    await fillChampionship({ start_date: '31/02/2027' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'start_date'), MESSAGES.dateInvalid);
  });

  it('rejeita Prova individual no futebol', async function () {
    await openForm();
    await fillChampionship({ sport: 'Futebol', format: 'Prova individual' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'format'), MESSAGES.individualOnlyRun);
  });

  it('organizador pendente é bloqueado', async function () {
    await openForm('pendente@arenalocal.com');
    assert.equal(await text(driver, '#pending-block'), MESSAGES.pendingBlock);
    assert.equal(await exists(driver, '#championship-form'), false);
  });

  it('usuário comum recebe acesso negado', async function () {
    await openForm('usuario@arenalocal.com');
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
  });
});
