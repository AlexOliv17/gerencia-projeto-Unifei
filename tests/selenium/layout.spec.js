const assert = require('node:assert/strict');
const { By } = require('selenium-webdriver');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const { visit, exists, login, logout } = require('./support/ui');

describe('Layout das tabelas (BUG-R1-01 / Mantis #1)', function () {
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

  /** Every cell of a row must start at the same height and span the whole row. */
  async function assertRowsAligned(rowSelector) {
    const rows = await driver.findElements(By.css(rowSelector));
    assert.ok(rows.length > 0, `nenhuma linha ${rowSelector}`);
    for (const row of rows) {
      const rowRect = await row.getRect();
      for (const cell of await row.findElements(By.css('td'))) {
        const rect = await cell.getRect();
        const label = `${await cell.getAttribute('class')} em "${(await row.getText()).split('\n')[0]}"`;
        assert.ok(Math.abs(rect.y - rowRect.y) <= 1, `célula ${label} começa fora da linha`);
        assert.ok(Math.abs(rect.height - rowRect.height) <= 1, `célula ${label} não ocupa a altura da linha`);
      }
    }
  }

  it('linhas de "Meus campeonatos" ficam alinhadas', async function () {
    await login(driver, server.baseUrl, 'organizador@arenalocal.com', 'Senha@123');
    await visit(driver, server.baseUrl, '/my/championships');
    await assertRowsAligned('tr[data-testid="championship-row"]');
  });

  it('linhas de "Todos os campeonatos" e "Usuários" ficam alinhadas', async function () {
    await login(driver, server.baseUrl, 'admin@arenalocal.com', 'Admin@123');
    await visit(driver, server.baseUrl, '/admin/championships');
    await assertRowsAligned('tr[data-testid="championship-row"]');
    await visit(driver, server.baseUrl, '/admin/users');
    await assertRowsAligned('tr[data-testid="user-row"]');
  });
});
