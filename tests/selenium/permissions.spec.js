const assert = require('node:assert/strict');
const { until } = require('selenium-webdriver');
const { MESSAGES } = require('../../src/constants');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  visit, text, exists, login, logout,
} = require('./support/ui');

const PROTECTED = {
  organizer: ['/my/championships', '/my/championships/new'],
  admin: ['/admin/users', '/admin/users/new', '/admin/outbox', '/admin/championships'],
};

const NAV = ['#nav-login', '#nav-register', '#nav-profile', '#nav-my-championships', '#nav-admin-users',
  '#nav-admin-championships', '#nav-admin-outbox'];

describe('Permissões por perfil', function () {
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

  async function visibleNav() {
    const shown = [];
    for (const id of NAV) if (await exists(driver, id)) shown.push(id);
    return shown;
  }

  /** Submits a POST from inside the page, as a crafted form on another tab would. */
  async function forgePost(path, fields = {}) {
    const body = await driver.findElement({ css: 'body' });
    await driver.executeScript((action, data) => {
      const form = document.createElement('form');
      form.method = 'post';
      form.action = action;
      for (const [name, value] of Object.entries(data)) {
        const input = document.createElement('input');
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    }, path, fields);
    await driver.wait(until.stalenessOf(body), 5000).catch(() => {});
    await driver.wait(async () => (await driver.executeScript('return document.readyState')) === 'complete', 5000);
  }

  it('visitante é levado ao login nas páginas restritas', async function () {
    for (const path of ['/profile', ...PROTECTED.organizer, ...PROTECTED.admin]) {
      await visit(driver, server.baseUrl, path);
      assert.match(await driver.getCurrentUrl(), /\/login$/, path);
    }
  });

  it('visitante vê só Campeonatos, Entrar e Cadastrar', async function () {
    await visit(driver, server.baseUrl, '/championships');
    assert.deepEqual(await visibleNav(), ['#nav-login', '#nav-register']);
  });

  it('usuário comum não acessa telas de organizador nem de admin', async function () {
    await login(driver, server.baseUrl, 'usuario@arenalocal.com', 'Senha@123');
    assert.deepEqual(await visibleNav(), ['#nav-profile']);
    for (const path of [...PROTECTED.organizer, ...PROTECTED.admin]) {
      await visit(driver, server.baseUrl, path);
      assert.equal(await text(driver, 'h1'), MESSAGES.forbidden, path);
    }
  });

  it('organizador não acessa telas de admin', async function () {
    await login(driver, server.baseUrl, 'organizador@arenalocal.com', 'Senha@123');
    assert.deepEqual(await visibleNav(), ['#nav-profile', '#nav-my-championships']);
    for (const path of PROTECTED.admin) {
      await visit(driver, server.baseUrl, path);
      assert.equal(await text(driver, 'h1'), MESSAGES.forbidden, path);
    }
  });

  it('administrador não cadastra campeonatos como organizador', async function () {
    await login(driver, server.baseUrl, 'admin@arenalocal.com', 'Admin@123');
    assert.deepEqual(await visibleNav(), ['#nav-profile', '#nav-admin-users', '#nav-admin-championships', '#nav-admin-outbox']);
    for (const path of PROTECTED.organizer) {
      await visit(driver, server.baseUrl, path);
      assert.equal(await text(driver, 'h1'), MESSAGES.forbidden, path);
    }
  });

  it('usuário comum não cancela campeonato com POST forjado', async function () {
    const { id } = server.db.prepare("SELECT id FROM championships WHERE name = 'Copa Itajubá de Futsal'").get();
    await login(driver, server.baseUrl, 'usuario@arenalocal.com', 'Senha@123');
    await forgePost(`/championships/${id}/cancel`, { reason: 'tentativa' });
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    assert.equal(server.db.prepare('SELECT status FROM championships WHERE id = ?').get(id).status, 'active');
  });

  it('visitante não exclui usuário com POST forjado', async function () {
    const { id } = server.db.prepare("SELECT id FROM users WHERE email = 'usuario@arenalocal.com'").get();
    await visit(driver, server.baseUrl, '/championships');
    await forgePost(`/admin/users/${id}/delete`);
    assert.match(await driver.getCurrentUrl(), /\/login$/);
    assert.equal(server.db.prepare('SELECT deleted_at FROM users WHERE id = ?').get(id).deleted_at, null);
  });
});
