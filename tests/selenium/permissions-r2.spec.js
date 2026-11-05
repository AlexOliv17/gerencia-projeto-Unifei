const assert = require('node:assert/strict');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  visit, fill, click, text, texts, exists, login, logout,
} = require('./support/ui');

describe('Permissões - equipes e inscrições', function () {
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

  it('visitante vai ao login nas telas de equipes e inscrições', async function () {
    const paths = ['/my/teams', '/my/teams/new', '/my/registrations', `/championships/${copaId()}/register`,
      `/my/championships/${copaId()}/registrations`, '/teams/1'];
    for (const path of paths) {
      await visit(driver, server.baseUrl, path);
      assert.match(await driver.getCurrentUrl(), /\/login$/, path);
    }
  });

  it('visitante e admin não veem Minhas equipes nem Minhas inscrições', async function () {
    await visit(driver, server.baseUrl, '/championships');
    assert.equal(await exists(driver, '#nav-my-teams'), false);
    assert.equal(await exists(driver, '#nav-my-registrations'), false);
    await login(driver, server.baseUrl, 'admin@arenalocal.com', 'Admin@123');
    assert.equal(await exists(driver, '#nav-my-teams'), false);
    assert.equal(await exists(driver, '#nav-my-registrations'), false);
    await visit(driver, server.baseUrl, `/championships/${copaId()}`);
    assert.equal(await exists(driver, '#register-button'), false);
  });

  it('organizador vê "Equipe removida" após exclusão da conta do responsável', async function () {
    await login(driver, server.baseUrl, 'capita@arenalocal.com', 'Senha@123');
    await visit(driver, server.baseUrl, '/profile');
    await fill(driver, { delete_password: 'Senha@123' });
    await click(driver, '#delete-account');
    await login(driver, server.baseUrl, 'organizador@arenalocal.com', 'Senha@123');
    await visit(driver, server.baseUrl, `/my/championships/${copaId()}/registrations`);
    const rows = await driver.findElements({ css: 'tr[data-testid="review-row"]' });
    const removed = [];
    for (const row of rows) {
      const entry = (await (await row.findElement({ css: '.entry' })).getText()).trim();
      const status = (await (await row.findElement({ css: '.status' })).getText()).trim();
      if (entry === 'Equipe removida') removed.push(status);
    }
    assert.deepEqual(removed, ['Cancelada']);
    await visit(driver, server.baseUrl, `/championships/${copaId()}`);
    assert.deepEqual(await texts(driver, 'li[data-testid="approved-entry"]'), []);
    assert.equal(await text(driver, 'h1'), 'Copa Itajubá de Futsal');
  });
});
