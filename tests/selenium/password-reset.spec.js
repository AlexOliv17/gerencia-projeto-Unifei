const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  visit, fill, submit, flash, text, login, logout, find,
} = require('./support/ui');

describe('RFS02 - Recuperar senha', function () {
  let server;
  let driver;
  let resetLink;

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  const outboxCount = () => server.db.prepare('SELECT COUNT(*) AS n FROM outbox').get().n;

  async function requestReset(email) {
    await visit(driver, server.baseUrl, '/password/forgot');
    await fill(driver, { email });
    await submit(driver);
  }

  it('redefine a senha pelo link da caixa de saída', async function () {
    await requestReset('usuario@arenalocal.com');
    assert.equal(await flash(driver), MESSAGES.forgotSent);

    await login(driver, server.baseUrl, 'admin@arenalocal.com', 'Admin@123');
    await visit(driver, server.baseUrl, '/admin/outbox');
    assert.equal(await text(driver, 'tr[data-testid="outbox-row"] .recipient'), 'usuario@arenalocal.com');
    assert.equal(await text(driver, 'tr[data-testid="outbox-row"] .subject'), 'Redefinição de senha');
    resetLink = await (await find(driver, 'tr[data-testid="outbox-row"] a.outbox-link')).getAttribute('href');
    await logout(driver);

    await driver.get(resetLink);
    await fill(driver, { password: 'NovaSenha@1', password_confirm: 'NovaSenha@1' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.resetDone);

    await login(driver, server.baseUrl, 'usuario@arenalocal.com', 'NovaSenha@1');
    assert.equal(await text(driver, '#current-user-name'), 'João Torcedor');
    await logout(driver);
  });

  it('rejeita o mesmo link uma segunda vez', async function () {
    await driver.get(resetLink);
    assert.equal(await flash(driver), MESSAGES.resetInvalid);
  });

  it('valida a nova senha', async function () {
    await requestReset('organizador@arenalocal.com');
    const { link } = server.db.prepare("SELECT link FROM outbox WHERE recipient = 'organizador@arenalocal.com'").get();
    await driver.get(link);
    await fill(driver, { password: 'curta', password_confirm: 'curta' });
    await submit(driver);
    assert.equal(await text(driver, '#error-password'), MESSAGES.passwordShort);
  });

  it('não revela se o e-mail existe', async function () {
    const before = outboxCount();
    await requestReset('naoexiste@exemplo.com');
    assert.equal(await flash(driver), MESSAGES.forgotSent);
    assert.equal(outboxCount(), before);
  });

  it('caixa de saída é exclusiva do administrador', async function () {
    await login(driver, server.baseUrl, 'usuario@arenalocal.com', 'NovaSenha@1');
    await visit(driver, server.baseUrl, '/admin/outbox');
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    await logout(driver);
  });
});
