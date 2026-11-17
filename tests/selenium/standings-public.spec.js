const assert = require('node:assert/strict');
const { formatBrDate } = require('../../src/validation/dates');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const { fixtures } = require('./support/fixtures');
const {
  visit, fill, submit, click, text, texts, exists, login, logout,
} = require('./support/ui');

describe('RFS13 - Exibir Tabela de Jogos e Classificação', function () {
  let server;
  let driver;
  let f;
  const ids = {};

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    f = fixtures(server.db);
    f.team('Time Azul');
    f.championship('Copa Pública', {
      startDate: f.inDays(-10), endDate: f.inDays(30), registrationDeadline: f.inDays(-12), pointsWin: 2,
    });
    const [leoas, azul, unidos] = ['Leoas da Serra', 'Time Azul', 'Unidos de Itajubá'].map((t) => f.register('Copa Pública', t));
    ids.game = f.game('Copa Pública', leoas, azul, { day: -1 });
    f.game('Copa Pública', azul, unidos, { day: 6, round: 'Rodada 2', time: '20:00' });
    f.championship('Copa Só Mata-mata', { format: 'knockout' });
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  const tablePath = (champ) => `/championships/${f.champId(champ)}/table`;
  const column = (css) => texts(driver, `tr[data-testid="standing-row"] ${css}`);

  it('visitante vê a classificação da Liga de Vôlei pelo link do campeonato, com a última atualização', async function () {
    await visit(driver, server.baseUrl, `/championships/${f.champId('Liga de Vôlei Santa Rita')}`);
    await click(driver, '#table-link');
    assert.deepEqual(await column('.name'), ['Estrelas do Vale', 'Ases de Santa Rita', 'Garças do Sapucaí']);
    assert.deepEqual(await column('.points'), ['3', '3', '0']);
    assert.deepEqual(await column('.diff'), ['2', '-1', '-1']);
    assert.deepEqual(await column('.points-diff'), ['18', '-12', '-6']);
    assert.match(await text(driver, '#last-update'), /^Última atualização: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    assert.deepEqual(await texts(driver, 'tr[data-testid="result-row"] .score'), ['3 x 1', '3 x 2']);
    assert.deepEqual(await texts(driver, 'tr[data-testid="upcoming-row"] .game'), ['Garças do Sapucaí x Estrelas do Vale']);
  });

  it('classificação é recalculada assim que o organizador registra o resultado', async function () {
    await visit(driver, server.baseUrl, tablePath('Copa Pública'));
    assert.equal(await text(driver, '#last-update'), 'Nenhum resultado registrado ainda.');
    assert.deepEqual(await column('.points'), ['0', '0', '0']);

    await login(driver, server.baseUrl, 'organizador@arenalocal.com', 'Senha@123');
    await visit(driver, server.baseUrl, `/games/${ids.game}/result`);
    await fill(driver, { score_a: '1', score_b: '3' });
    await submit(driver);
    await logout(driver);

    await visit(driver, server.baseUrl, tablePath('Copa Pública'));
    assert.deepEqual(await column('.name'), ['Time Azul', 'Unidos de Itajubá', 'Leoas da Serra']);
    assert.deepEqual(await column('.points'), ['2', '0', '0']);
    assert.deepEqual(await column('.played'), ['1', '0', '1']);
    assert.match(await text(driver, '#last-update'), /^Última atualização: /);
    assert.deepEqual(await texts(driver, 'tr[data-testid="upcoming-row"] .date'), [formatBrDate(f.inDays(6))]);
  });

  it('mata-mata não tem tabela de pontos', async function () {
    await visit(driver, server.baseUrl, tablePath('Copa Só Mata-mata'));
    assert.equal(await exists(driver, '#knockout-only'), true);
    assert.equal(await exists(driver, 'table[data-testid="standings"]'), false);
  });
});
