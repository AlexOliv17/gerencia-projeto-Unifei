const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const { fixtures } = require('./support/fixtures');
const {
  visit, click, flash, text, texts, exists, login, logout, forgePost,
} = require('./support/ui');

const JOAO = 'usuario@arenalocal.com';

describe('RFS17 - Seguir Campeonato ou Equipe', function () {
  let server;
  let driver;
  let f;

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    f = fixtures(server.db);
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  const followedChampionships = () => texts(driver, 'section[data-testid="followed-championship"] .name');
  const followedTeams = () => texts(driver, 'section[data-testid="followed-team"] .name');

  it('segue um campeonato pelo detalhe e ele aparece em Acompanhando', async function () {
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, `/championships/${f.champId('Copa Itajubá de Futsal')}`);
    await click(driver, '#follow-championship');
    assert.equal(await flash(driver), MESSAGES.followedChampionship);
    assert.equal(await exists(driver, '#unfollow-championship'), true);
    await click(driver, '#nav-following');
    assert.ok((await followedChampionships()).includes('Copa Itajubá de Futsal'));
  });

  it('segue uma equipe inscrita e vê o próximo jogo e o último resultado dela', async function () {
    const estrelas = f.teamId('Estrelas do Vale');
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, `/championships/${f.champId('Liga de Vôlei Santa Rita')}`);
    await click(driver, `#follow-team-${estrelas}`);
    assert.equal(await flash(driver), MESSAGES.followedTeam('Estrelas do Vale'));
    await visit(driver, server.baseUrl, '/my/following');
    assert.ok((await followedTeams()).includes('Estrelas do Vale'));
    assert.match(await text(driver, `#followed-team-${estrelas} li[data-testid="team-upcoming"]`), /Garças do Sapucaí x Estrelas do Vale \(Liga de Vôlei Santa Rita\)$/);
    assert.match(await text(driver, `#followed-team-${estrelas} li[data-testid="team-result"]`), /Estrelas do Vale 3 x 1 Ases de Santa Rita/);
  });

  it('deixa de seguir pela área Acompanhando', async function () {
    const leoas = f.teamId('Leoas da Serra');
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/following');
    assert.ok((await followedTeams()).includes('Leoas da Serra'));
    await click(driver, `#unfollow-team-${leoas}`);
    assert.equal(await flash(driver), MESSAGES.unfollowed);
    assert.equal((await followedTeams()).includes('Leoas da Serra'), false);
  });

  it('campeonato cancelado não pode ser seguido, nem por POST forjado', async function () {
    const piranguinho = f.champId('Copa Piranguinho');
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, `/championships/${piranguinho}`);
    assert.equal(await exists(driver, '#follow-championship'), false);
    await forgePost(driver, `/championships/${piranguinho}/follow`);
    assert.equal(await flash(driver), MESSAGES.followCancelled);
  });

  it('visitante e administrador não seguem', async function () {
    const copa = f.champId('Copa Itajubá de Futsal');
    await visit(driver, server.baseUrl, `/championships/${copa}`);
    assert.equal(await exists(driver, '#follow-championship'), false);
    await visit(driver, server.baseUrl, '/my/following');
    assert.equal(await text(driver, 'h1'), 'Entrar');
    await login(driver, server.baseUrl, 'admin@arenalocal.com', 'Admin@123');
    await visit(driver, server.baseUrl, `/championships/${copa}`);
    assert.equal(await exists(driver, '#follow-championship'), false);
    await forgePost(driver, `/championships/${copa}/follow`);
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
  });

  it('equipe ou campeonato inexistente responde página não encontrada', async function () {
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/following');
    await forgePost(driver, '/teams/99999/follow');
    assert.equal(await text(driver, 'h1'), 'Página não encontrada');
    await visit(driver, server.baseUrl, '/my/following');
    await forgePost(driver, '/championships/99999/follow');
    assert.equal(await text(driver, 'h1'), 'Página não encontrada');
  });
});
