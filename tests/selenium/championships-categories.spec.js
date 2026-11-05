const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  visit, fill, find, submit, flash, fieldError, exists, login, logout,
} = require('./support/ui');

describe('Campeonato - categorias e lista de espera', function () {
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

  const copaId = () => server.db.prepare("SELECT id FROM championships WHERE name = 'Copa Itajubá de Futsal'").get().id;
  const registrationCategories = () => server.db.prepare(`SELECT cc.name FROM registrations r
    JOIN championship_categories cc ON cc.id = r.category_id WHERE r.championship_id = ? ORDER BY r.id`).all(copaId())
    .map((r) => r.name);

  async function editCopa() {
    await login(driver, server.baseUrl, 'organizador@arenalocal.com', 'Senha@123');
    await visit(driver, server.baseUrl, `/my/championships/${copaId()}/edit`);
  }

  it('mantém as inscrições ao alterar o campeonato', async function () {
    await editCopa();
    await fill(driver, { venue: 'Ginásio Novo', categories: 'adulto, Sub-17, Master' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.champSaved);
    assert.deepEqual(registrationCategories(), ['adulto', 'adulto']);
  });

  it('não remove categoria com inscrições', async function () {
    await editCopa();
    await fill(driver, { categories: 'Sub-17' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'categories'), MESSAGES.categoryInUse('adulto'));
    assert.deepEqual(registrationCategories(), ['adulto', 'adulto']);
  });

  it('salva a opção de lista de espera', async function () {
    await editCopa();
    const checkbox = await find(driver, '#allow_waitlist');
    assert.equal(await checkbox.isSelected(), false);
    await checkbox.click();
    await submit(driver);
    assert.equal(server.db.prepare('SELECT allow_waitlist FROM championships WHERE id = ?').get(copaId()).allow_waitlist, 1);
    await visit(driver, server.baseUrl, `/my/championships/${copaId()}/edit`);
    assert.equal(await (await find(driver, '#allow_waitlist')).isSelected(), true);
  });
});
