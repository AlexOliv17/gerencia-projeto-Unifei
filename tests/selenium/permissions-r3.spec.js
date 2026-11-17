const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { createUser } = require('../../src/models/users');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const { fixtures } = require('./support/fixtures');
const {
  visit, text, exists, login, logout, forgePost,
} = require('./support/ui');

describe('Permissões - tabela de jogos, resultados e relatório', function () {
  let server;
  let driver;
  let f;
  let gameId;
  let liga;
  let corrida;

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    f = fixtures(server.db);
    liga = f.champId('Liga de Vôlei Santa Rita');
    corrida = f.champId('Corrida Rústica de Pouso Alegre');
    gameId = server.db.prepare("SELECT id FROM matches WHERE round = 'Rodada 1'").get().id;
    createUser(server.db, {
      name: 'Olga Outra', email: 'outro@exemplo.com', password: 'Senha@123', cityId: 1,
      role: 'organizer', status: 'active', document: '98765432100', leagueName: 'Liga da Serra',
    });
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  const managementPaths = () => [
    `/my/championships/${liga}/games`, `/my/championships/${liga}/games/new`, `/games/${gameId}/result`,
    `/games/${gameId}/history`, `/my/championships/${corrida}/races`, `/my/championships/${liga}/report`,
  ];

  it('visitante é levado ao login nas telas de gestão, mas vê a tabela pública', async function () {
    for (const path of managementPaths()) {
      await visit(driver, server.baseUrl, path);
      assert.equal(await text(driver, 'h1'), 'Entrar', path);
    }
    await visit(driver, server.baseUrl, `/championships/${liga}/table`);
    assert.equal(await exists(driver, 'tr[data-testid="standing-row"]'), true);
  });

  it('usuário comum e administrador recebem acesso negado', async function () {
    for (const [email, password] of [['usuario@arenalocal.com', 'Senha@123'], ['admin@arenalocal.com', 'Admin@123']]) {
      await login(driver, server.baseUrl, email, password);
      for (const path of managementPaths()) {
        await visit(driver, server.baseUrl, path);
        assert.equal(await text(driver, 'h1'), MESSAGES.forbidden, `${email} ${path}`);
      }
      await logout(driver);
    }
  });

  it('outro organizador não vê nem altera a tabela, inclusive por POST forjado', async function () {
    await login(driver, server.baseUrl, 'outro@exemplo.com', 'Senha@123');
    for (const path of managementPaths()) {
      await visit(driver, server.baseUrl, path);
      assert.equal(await text(driver, 'h1'), MESSAGES.forbidden, path);
    }
    await forgePost(driver, `/games/${gameId}/result`, { score_a: '0', score_b: '3' });
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    await forgePost(driver, `/games/${gameId}/cancel`);
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    const game = server.db.prepare('SELECT score_a, status FROM matches WHERE id = ?').get(gameId);
    assert.deepEqual({ ...game }, { score_a: 3, status: 'scheduled' });
  });

  it('organizador pendente vê o aviso de validação', async function () {
    await login(driver, server.baseUrl, 'pendente@arenalocal.com', 'Senha@123');
    await visit(driver, server.baseUrl, `/my/championships/${liga}/games`);
    assert.equal(await text(driver, 'h1'), 'Cadastro em validação');
  });

  it('jogo inexistente responde página não encontrada', async function () {
    await login(driver, server.baseUrl, 'organizador@arenalocal.com', 'Senha@123');
    await visit(driver, server.baseUrl, '/games/99999/result');
    assert.equal(await text(driver, 'h1'), 'Página não encontrada');
  });
});
