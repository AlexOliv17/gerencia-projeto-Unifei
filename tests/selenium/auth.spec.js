const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { createUser } = require('../../src/models/users');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  fill, submit, flash, text, exists, login, logout, visit,
} = require('./support/ui');

describe('RFS02 - Autenticar Usuário', function () {
  let server;
  let driver;

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    const cityId = server.db.prepare("SELECT id FROM cities WHERE name = 'Itajubá'").get().id;
    createUser(server.db, { name: 'Bia Bloqueio', email: 'bloqueio@exemplo.com', password: 'Senha@123', cityId, role: 'user', status: 'active' });
    createUser(server.db, { name: 'Sid Suspenso', email: 'suspenso@exemplo.com', password: 'Senha@123', cityId, role: 'user', status: 'suspended' });
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  it('faz login e logout', async function () {
    await login(driver, server.baseUrl, 'usuario@arenalocal.com', 'Senha@123');
    assert.equal(await text(driver, '#current-user-name'), 'João Torcedor');
    await logout(driver);
    assert.equal(await flash(driver), MESSAGES.loggedOut);
    assert.equal(await exists(driver, '#nav-login'), true);
  });

  it('aceita e-mail com maiúsculas e espaços', async function () {
    await login(driver, server.baseUrl, '  Usuario@ArenaLocal.com ', 'Senha@123');
    assert.equal(await text(driver, '#current-user-name'), 'João Torcedor');
  });

  it('rejeita senha errada sem revelar qual campo errou', async function () {
    await login(driver, server.baseUrl, 'usuario@arenalocal.com', 'errada123');
    assert.equal(await flash(driver), MESSAGES.loginInvalid);
    assert.equal(await exists(driver, '#nav-logout'), false);
  });

  it('rejeita e-mail inexistente com a mesma mensagem', async function () {
    await login(driver, server.baseUrl, 'ninguem@exemplo.com', 'Senha@123');
    assert.equal(await flash(driver), MESSAGES.loginInvalid);
  });

  it('bloqueia a conta após 5 tentativas inválidas', async function () {
    for (let i = 0; i < 5; i += 1) {
      await login(driver, server.baseUrl, 'bloqueio@exemplo.com', 'errada123');
    }
    await login(driver, server.baseUrl, 'bloqueio@exemplo.com', 'Senha@123');
    assert.equal(await flash(driver), MESSAGES.loginLocked);
    assert.equal(await exists(driver, '#nav-logout'), false);
  });

  it('impede conta suspensa', async function () {
    await login(driver, server.baseUrl, 'suspenso@exemplo.com', 'Senha@123');
    assert.equal(await flash(driver), MESSAGES.loginSuspended);
  });

  it('organizador pendente entra e vê o aviso de validação', async function () {
    await login(driver, server.baseUrl, 'pendente@arenalocal.com', 'Senha@123');
    assert.equal(await text(driver, '#pending-notice'), MESSAGES.pendingNotice);
  });

  it('mantém o e-mail digitado após erro de login', async function () {
    await visit(driver, server.baseUrl, '/login');
    await fill(driver, { email: 'usuario@arenalocal.com', password: 'errada123' });
    await submit(driver);
    const email = await (await driver.findElement({ css: '#email' })).getAttribute('value');
    assert.equal(email, 'usuario@arenalocal.com');
  });
});
