const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { createUser } = require('../../src/models/users');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  visit, fill, selectByText, submit, click, flash, fieldError, texts, exists, login, logout,
} = require('./support/ui');

describe('RFS03/RFS04 - Administração de usuários', function () {
  let server;
  let driver;

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    const cityId = server.db.prepare("SELECT id FROM cities WHERE name = 'Itajubá'").get().id;
    createUser(server.db, { name: 'Rita Remover', email: 'remover@exemplo.com', password: 'Senha@123', cityId, role: 'user', status: 'active' });
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  beforeEach(async function () {
    await login(driver, server.baseUrl, 'admin@arenalocal.com', 'Admin@123');
    await visit(driver, server.baseUrl, '/admin/users');
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  const idOf = (email) => server.db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  const listedEmails = () => texts(driver, 'tr[data-testid="user-row"] .email');

  it('não exclui o último administrador ativo', async function () {
    await click(driver, `#delete-user-${idOf('admin@arenalocal.com')}`);
    await click(driver, '#confirm-delete');
    assert.equal(await flash(driver), MESSAGES.lastAdmin);
    assert.ok((await listedEmails()).includes('admin@arenalocal.com'));
  });

  it('não rebaixa o último administrador ativo', async function () {
    await click(driver, `#edit-user-${idOf('admin@arenalocal.com')}`);
    await selectByText(driver, 'role', 'Usuário');
    await submit(driver);
    assert.equal(await fieldError(driver, 'role'), MESSAGES.lastAdminDemote);
  });

  it('filtra organizadores pendentes', async function () {
    await selectByText(driver, 'role', 'Organizador');
    await selectByText(driver, 'status', 'Pendente');
    await click(driver, '#filter-submit');
    assert.deepEqual(await listedEmails(), ['pendente@arenalocal.com']);
  });

  it('filtra por parte do nome', async function () {
    await fill(driver, { name: 'torcedor' });
    await click(driver, '#filter-submit');
    assert.deepEqual(await listedEmails(), ['usuario@arenalocal.com']);
  });

  it('ativa organizador pendente', async function () {
    await click(driver, `#edit-user-${idOf('pendente@arenalocal.com')}`);
    await selectByText(driver, 'status', 'Ativo');
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.userSaved);
    await logout(driver);
    await login(driver, server.baseUrl, 'pendente@arenalocal.com', 'Senha@123');
    assert.equal(await exists(driver, '#pending-notice'), false);
  });

  it('exige CPF/CNPJ ao tornar alguém organizador', async function () {
    await click(driver, `#edit-user-${idOf('remover@exemplo.com')}`);
    await selectByText(driver, 'role', 'Organizador');
    await fill(driver, { league_name: 'Liga X' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'document'), MESSAGES.documentInvalid);
  });

  it('cadastra outro administrador', async function () {
    await click(driver, '#new-user');
    await fill(driver, { name: 'Ana Admin', email: 'ana@arenalocal.com', password: 'Senha@123', password_confirm: 'Senha@123' });
    await selectByText(driver, 'city_id', 'Itajubá');
    await selectByText(driver, 'role', 'Administrador');
    await selectByText(driver, 'status', 'Ativo');
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.userCreated);
    await logout(driver);
    await login(driver, server.baseUrl, 'ana@arenalocal.com', 'Senha@123');
    assert.equal(await exists(driver, '#nav-admin-users'), true);
  });

  it('exclui um usuário', async function () {
    await click(driver, `#delete-user-${idOf('remover@exemplo.com')}`);
    await click(driver, '#confirm-delete');
    assert.equal(await flash(driver), MESSAGES.userDeleted);
    assert.equal((await listedEmails()).includes('remover@exemplo.com'), false);
  });

  it('suspender derruba a sessão aberta do usuário', async function () {
    const other = await buildDriver();
    try {
      await login(other, server.baseUrl, 'usuario@arenalocal.com', 'Senha@123');
      assert.equal(await exists(other, '#nav-logout'), true);

      await click(driver, `#edit-user-${idOf('usuario@arenalocal.com')}`);
      await selectByText(driver, 'status', 'Suspenso');
      await submit(driver);
      assert.equal(await flash(driver), MESSAGES.userSaved);

      await visit(other, server.baseUrl, '/profile');
      assert.match(await other.getCurrentUrl(), /\/login$/);
      assert.equal(await exists(other, '#nav-logout'), false);
    } finally {
      await quitDriver(other);
    }
  });
});
