const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { createUser } = require('../../src/models/users');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  visit, fill, selectByText, selectedText, submit, click, flash, fieldError, text, exists, value, login, logout,
} = require('./support/ui');

describe('RFS03/RFS04 - Meu perfil', function () {
  let server;
  let driver;

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    const cityId = server.db.prepare("SELECT id FROM cities WHERE name = 'Itajubá'").get().id;
    for (const [name, email] of [['Pedro Perfil', 'perfil@exemplo.com'], ['Sara Senha', 'senha@exemplo.com'], ['Edu Exclui', 'exclui@exemplo.com']]) {
      createUser(server.db, { name, email, password: 'Senha@123', cityId, role: 'user', status: 'active' });
    }
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  async function openProfile(email, password = 'Senha@123') {
    await login(driver, server.baseUrl, email, password);
    await visit(driver, server.baseUrl, '/profile');
  }

  it('mostra perfil e status sem permitir alterá-los', async function () {
    await openProfile('perfil@exemplo.com');
    assert.equal(await text(driver, '#profile-role'), 'Usuário');
    assert.equal(await text(driver, '#profile-status'), 'Ativo');
    assert.equal(await exists(driver, '#role'), false);
    assert.equal(await exists(driver, '#document'), false);
  });

  it('altera nome e cidade', async function () {
    await openProfile('perfil@exemplo.com');
    await fill(driver, { name: 'Pedro Perfil Silva' });
    await selectByText(driver, 'city_id', 'Pouso Alegre');
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.profileSaved);
    assert.equal(await text(driver, '#current-user-name'), 'Pedro Perfil Silva');
    assert.equal(await selectedText(driver, 'city_id'), 'Pouso Alegre');
  });

  it('rejeita e-mail de outro usuário', async function () {
    await openProfile('perfil@exemplo.com');
    await fill(driver, { email: 'Organizador@ArenaLocal.com' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'email'), MESSAGES.emailTaken);
  });

  it('rejeita troca de senha com a senha atual errada', async function () {
    await openProfile('senha@exemplo.com');
    await fill(driver, { current_password: 'errada123', new_password: 'Nova@1234', new_password_confirm: 'Nova@1234' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'current_password'), MESSAGES.currentPasswordWrong);
  });

  it('troca a senha informando a senha atual', async function () {
    await openProfile('senha@exemplo.com');
    await fill(driver, { current_password: 'Senha@123', new_password: 'Nova@1234', new_password_confirm: 'Nova@1234' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.profileSaved);
    await logout(driver);
    await login(driver, server.baseUrl, 'senha@exemplo.com', 'Nova@1234');
    assert.equal(await text(driver, '#current-user-name'), 'Sara Senha');
  });

  it('organizador altera os dados da liga', async function () {
    await openProfile('organizador@arenalocal.com');
    assert.equal(await text(driver, '#profile-role'), 'Organizador');
    assert.equal(await value(driver, 'league_name'), 'Liga Sul Mineira');
    await fill(driver, { league_name: 'Liga Sul Mineira de Esportes' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.profileSaved);
    assert.equal(await value(driver, 'league_name'), 'Liga Sul Mineira de Esportes');
  });

  it('exige a senha para excluir a própria conta', async function () {
    await openProfile('exclui@exemplo.com');
    await fill(driver, { delete_password: 'errada123' });
    await click(driver, '#delete-account');
    assert.equal(await fieldError(driver, 'delete_password'), MESSAGES.deletePasswordWrong);
  });

  it('exclui a própria conta e libera o e-mail', async function () {
    await openProfile('exclui@exemplo.com');
    await fill(driver, { delete_password: 'Senha@123' });
    await click(driver, '#delete-account');
    assert.equal(await flash(driver), MESSAGES.accountDeleted);
    assert.equal(await exists(driver, '#nav-login'), true);

    await login(driver, server.baseUrl, 'exclui@exemplo.com', 'Senha@123');
    assert.equal(await flash(driver), MESSAGES.loginInvalid);

    const row = server.db.prepare("SELECT name, document FROM users WHERE email LIKE 'removed-%'").get();
    assert.deepEqual(row, { name: 'Usuário removido', document: null });

    await visit(driver, server.baseUrl, '/register');
    await fill(driver, { name: 'Edu Novo', email: 'exclui@exemplo.com', password: 'Senha@123', password_confirm: 'Senha@123' });
    await selectByText(driver, 'city_id', 'Itajubá');
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.registeredUser);
  });
});
