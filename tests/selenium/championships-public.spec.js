const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { anonymizeUser } = require('../../src/models/users');
const { todayIso, formatBrDate } = require('../../src/validation/dates');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  visit, find, fill, selectByText, selectedText, click, text, texts, exists, login, logout,
} = require('./support/ui');

describe('RFS12 - Consulta pública de campeonatos', function () {
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

  const idOf = (name) => server.db.prepare('SELECT id FROM championships WHERE name = ?').get(name).id;
  const listedNames = () => texts(driver, 'tr[data-testid="championship-row"] .name');
  const openList = () => visit(driver, server.baseUrl, '/championships');

  it('visitante vê os não cancelados: atuais e futuros primeiro, depois os passados', async function () {
    await openList();
    assert.deepEqual(await listedNames(), [
      'Liga de Vôlei Santa Rita',
      'Copa Itajubá de Futsal',
      'Corrida Rústica de Pouso Alegre',
      'Torneio de Futebol de Verão',
    ]);
  });

  it('filtra por cidade', async function () {
    await openList();
    await selectByText(driver, 'city_id', 'Pouso Alegre');
    await click(driver, '#filter-submit');
    assert.deepEqual(await listedNames(), ['Corrida Rústica de Pouso Alegre']);
  });

  it('filtra por modalidade', async function () {
    await openList();
    await selectByText(driver, 'sport', 'Futsal');
    await click(driver, '#filter-submit');
    assert.deepEqual(await listedNames(), ['Copa Itajubá de Futsal']);
  });

  it('filtra por categoria sem diferenciar maiúsculas', async function () {
    await openList();
    await fill(driver, { category: 'sub-17' });
    await click(driver, '#filter-submit');
    assert.deepEqual(await listedNames(), ['Copa Itajubá de Futsal']);
  });

  it('filtra por uma data única', async function () {
    await openList();
    await fill(driver, { date_from: formatBrDate(todayIso()) });
    await click(driver, '#filter-submit');
    assert.deepEqual(await listedNames(), ['Liga de Vôlei Santa Rita']);
  });

  it('mostra só inscrições abertas', async function () {
    await openList();
    await (await find(driver, '#open_only')).click();
    await click(driver, '#filter-submit');
    assert.deepEqual(await listedNames(), ['Copa Itajubá de Futsal', 'Corrida Rústica de Pouso Alegre']);
  });

  it('sugere a cidade do usuário logado', async function () {
    await login(driver, server.baseUrl, 'usuario@arenalocal.com', 'Senha@123');
    await openList();
    assert.equal(await selectedText(driver, 'city_id'), 'Itajubá');
    assert.deepEqual(await listedNames(), ['Copa Itajubá de Futsal', 'Torneio de Futebol de Verão']);
    await selectByText(driver, 'city_id', 'Todas');
    await click(driver, '#filter-submit');
    assert.equal((await listedNames()).length, 4);
  });

  it('avisa quando nada é encontrado', async function () {
    await openList();
    await selectByText(driver, 'city_id', 'Brazópolis');
    await click(driver, '#filter-submit');
    assert.equal(await text(driver, '#no-results'), MESSAGES.noResults);
  });

  it('mostra os detalhes do campeonato', async function () {
    await openList();
    await click(driver, `#details-${idOf('Copa Itajubá de Futsal')}`);
    assert.equal(await text(driver, '#championship-name'), 'Copa Itajubá de Futsal');
    assert.equal(await text(driver, '#championship-status'), 'Em inscrição');
    assert.equal(await text(driver, '#championship-organizer'), 'Liga Sul Mineira');
    assert.equal(await text(driver, '#championship-categories'), 'Adulto, Sub-17');
  });

  it('campeonato cancelado continua acessível pelo link, com o motivo', async function () {
    await visit(driver, server.baseUrl, `/championships/${idOf('Copa Piranguinho')}`);
    assert.equal(await text(driver, '#championship-status'), 'Cancelado');
    assert.equal(await text(driver, '#cancel-reason'), 'Falta de inscritos');
  });

  it('campeonato inexistente responde página não encontrada', async function () {
    await visit(driver, server.baseUrl, '/championships/9999');
    assert.equal(await text(driver, 'h1'), 'Página não encontrada');
  });

  it('organizador excluído aparece como removido', async function () {
    const organizerId = server.db.prepare("SELECT id FROM users WHERE email = 'organizador@arenalocal.com'").get().id;
    anonymizeUser(server.db, organizerId);
    await visit(driver, server.baseUrl, `/championships/${idOf('Copa Itajubá de Futsal')}`);
    assert.equal(await text(driver, '#championship-organizer'), 'Organizador removido');
  });
});
