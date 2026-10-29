const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  visit, fill, selectByText, submit, flash, fieldError, value, texts,
} = require('./support/ui');

describe('RFS01 - Cadastrar Usuário', function () {
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

  async function openForm() {
    await visit(driver, server.baseUrl, '/register');
  }

  async function fillUser({ name, email, password = 'Senha@123', confirm = password, city = 'Itajubá', role = 'Usuário' }) {
    await fill(driver, { name, email, password, password_confirm: confirm });
    await selectByText(driver, 'city_id', city);
    await selectByText(driver, 'role', role);
  }

  it('cadastra usuário comum e pede login', async function () {
    await openForm();
    await fillUser({ name: 'Maria Atleta', email: 'maria@exemplo.com' });
    await submit(driver);
    assert.match(await driver.getCurrentUrl(), /\/login$/);
    assert.equal(await flash(driver), MESSAGES.registeredUser);
  });

  it('cadastra organizador como pendente', async function () {
    await openForm();
    await fillUser({ name: 'Otávio Liga', email: 'otavio@exemplo.com', role: 'Organizador' });
    await fill(driver, { document: '123.456.789-09', league_name: 'Liga Teste' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.registeredOrganizer);
    const row = server.db.prepare('SELECT status, document FROM users WHERE email = ?').get('otavio@exemplo.com');
    assert.deepEqual(row, { status: 'pending', document: '12345678909' });
  });

  it('rejeita e-mail já cadastrado ignorando maiúsculas e mantém os dados', async function () {
    await openForm();
    await fillUser({ name: 'Outro João', email: '  USUARIO@arenalocal.com ' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'email'), MESSAGES.emailTaken);
    assert.equal(await value(driver, 'name'), 'Outro João');
    assert.equal(await value(driver, 'password'), '');
  });

  it('rejeita senha curta', async function () {
    await openForm();
    await fillUser({ name: 'Bia', email: 'bia@exemplo.com', password: '1234567' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'password'), MESSAGES.passwordShort);
  });

  it('exige CPF/CNPJ do organizador', async function () {
    await openForm();
    await fillUser({ name: 'Rui', email: 'rui@exemplo.com', role: 'Organizador' });
    await fill(driver, { league_name: 'Liga do Rui' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'document'), MESSAGES.documentInvalid);
  });

  it('não oferece o perfil Administrador', async function () {
    await openForm();
    assert.deepEqual(await texts(driver, '#role option'), ['Usuário', 'Organizador']);
  });
});
