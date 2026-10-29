const assert = require('node:assert/strict');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const { visit } = require('./support/ui');

describe('Smoke', function () {
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

  it('abre a página inicial e redireciona para a lista de campeonatos', async function () {
    await visit(driver, server.baseUrl, '/');
    assert.match(await driver.getCurrentUrl(), /\/championships$/);
    assert.equal(await driver.getTitle(), 'Campeonatos | Arena Local');
  });
});
