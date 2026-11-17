const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { formatBrDate } = require('../../src/validation/dates');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const { fixtures } = require('./support/fixtures');
const {
  visit, fill, submit, click, flash, fieldError, text, texts, exists, login, logout,
} = require('./support/ui');

const ORGANIZER = 'organizador@arenalocal.com';

describe('RFS10/RFS11 - Registrar Resultados e Classificação', function () {
  let server;
  let driver;
  let f;
  const ids = {};

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    f = fixtures(server.db);
    const inProgress = { startDate: f.inDays(-10), endDate: f.inDays(30), registrationDeadline: f.inDays(-12) };
    for (const name of ['Time Azul', 'Time Verde', 'Time Roxo']) f.team(name);

    f.championship('Copa Resultado', inProgress);
    const [leoas, azul, verde] = ['Leoas da Serra', 'Time Azul', 'Time Verde'].map((t) => f.register('Copa Resultado', t));
    ids.played = f.game('Copa Resultado', leoas, azul, { day: -2 });
    ids.future = f.game('Copa Resultado', azul, verde, { day: 5, round: 'Rodada 2' });

    f.championship('Copa Eliminatória', { ...inProgress, format: 'knockout' });
    const [kLeoas, kAzul, kVerde, kRoxo] = ['Leoas da Serra', 'Time Azul', 'Time Verde', 'Time Roxo']
      .map((t) => f.register('Copa Eliminatória', t));
    ids.final = f.game('Copa Eliminatória', null, null, { day: -1, round: 'Final', kind: 'knockout' });
    ids.semi1 = f.game('Copa Eliminatória', kLeoas, kRoxo, {
      day: -3, round: 'Semifinal', kind: 'knockout', next: ids.final, slot: 'a',
    });
    ids.semi2 = f.game('Copa Eliminatória', kAzul, kVerde, {
      day: -3, time: '21:00', round: 'Semifinal', kind: 'knockout', next: ids.final, slot: 'b',
    });

    f.championship('Liga Vôlei Teste', { ...inProgress, sport: 'volleyball' });
    const [estrelas, ases] = ['Estrelas do Vale', 'Ases de Santa Rita'].map((t) => f.register('Liga Vôlei Teste', t));
    ids.volley = f.game('Liga Vôlei Teste', estrelas, ases, { day: -1 });

    f.championship('Copa Grupos', { ...inProgress, format: 'groups_knockout' });
    const [gLeoas, gAzul, gVerde] = ['Leoas da Serra', 'Time Azul', 'Time Verde'].map((t) => f.register('Copa Grupos', t));
    const group = { group: 'A', day: -5 };
    f.result(f.game('Copa Grupos', gLeoas, gAzul, { ...group, time: '08:00' }), 2, 0);
    f.result(f.game('Copa Grupos', gAzul, gVerde, { ...group, time: '10:00', round: 'Rodada 2' }), 1, 1);
    ids.lastGroupGame = f.game('Copa Grupos', gVerde, gLeoas, { ...group, time: '12:00', round: 'Rodada 3' });
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  const tablePath = (champ) => `/my/championships/${f.champId(champ)}/games`;

  async function openTable(champ) {
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, tablePath(champ));
  }

  async function saveResult(id, values) {
    await click(driver, `#result-match-${id}`);
    await fill(driver, values);
    await submit(driver);
  }

  it('registra o resultado com data, hora e responsável', async function () {
    await openTable('Copa Resultado');
    await saveResult(ids.played, { score_a: '2', score_b: '1' });
    assert.equal(await flash(driver), MESSAGES.resultSaved);
    assert.equal(await text(driver, `#match-${ids.played} .score`), '2 x 1');
    assert.match(await text(driver, `#match-${ids.played} .status`), /^Encerrado\s+Atualizado em \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} por Carlos Organizador$/);
  });

  it('corrige o resultado e guarda o histórico da correção', async function () {
    await openTable('Copa Resultado');
    await saveResult(ids.played, { score_a: '2', score_b: '2' });
    assert.equal(await text(driver, `#match-${ids.played} .score`), '2 x 2');
    await click(driver, `#history-match-${ids.played}`);
    assert.deepEqual(await texts(driver, 'li[data-testid="history-entry"] .what'), [
      'Resultado corrigido: Leoas da Serra 2 x 1 Time Azul → Leoas da Serra 2 x 2 Time Azul',
      'Resultado registrado: Leoas da Serra 2 x 1 Time Azul',
    ]);
    assert.deepEqual(await texts(driver, 'li[data-testid="history-entry"] .who'), ['Carlos Organizador', 'Carlos Organizador']);
  });

  it('não registra resultado de jogo que ainda não aconteceu', async function () {
    await openTable('Copa Resultado');
    assert.equal(await exists(driver, `#result-match-${ids.future}`), false);
    await visit(driver, server.baseUrl, `/games/${ids.future}/result`);
    assert.equal(await flash(driver), MESSAGES.resultTooEarly);
  });

  it('jogo eliminatório não termina empatado', async function () {
    await openTable('Copa Eliminatória');
    await saveResult(ids.semi1, { score_a: '1', score_b: '1' });
    assert.equal(await fieldError(driver, 'score_b'), MESSAGES.knockoutDraw);
  });

  it('o vencedor avança para a final e não muda depois que a final tem resultado (RFS11 regra 2)', async function () {
    await openTable('Copa Eliminatória');
    assert.equal(await text(driver, `#match-${ids.final} .team-a`), 'A definir');
    await saveResult(ids.semi1, { score_a: '3', score_b: '1' });
    await saveResult(ids.semi2, { score_a: '0', score_b: '2' });
    assert.equal(await text(driver, `#match-${ids.final} .team-a`), 'Leoas da Serra');
    assert.equal(await text(driver, `#match-${ids.final} .team-b`), 'Time Verde');

    await saveResult(ids.final, { score_a: '1', score_b: '0' });
    await saveResult(ids.semi1, { score_a: '0', score_b: '2' });
    assert.equal(await flash(driver), MESSAGES.resultWinnerLocked);
    await visit(driver, server.baseUrl, tablePath('Copa Eliminatória'));
    assert.equal(await text(driver, `#match-${ids.semi1} .score`), '3 x 1');
    assert.equal(await text(driver, `#match-${ids.final} .team-a`), 'Leoas da Serra');
  });

  it('vôlei: placar em sets, sem empate, pontos dos dois lados', async function () {
    await openTable('Liga Vôlei Teste');
    await saveResult(ids.volley, { score_a: '2', score_b: '2' });
    assert.equal(await fieldError(driver, 'score_b'), MESSAGES.volleyDraw);
    await fill(driver, { score_a: '3', score_b: '2', points_a: '101' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'points_b'), MESSAGES.volleyPointsBoth);
    await fill(driver, { points_b: '99' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.resultSaved);
    assert.equal(await text(driver, `#match-${ids.volley} .score`), '3 x 2');
  });

  it('grupos + mata-mata: com a fase de grupos encerrada, gera o mata-mata com os dois primeiros', async function () {
    await openTable('Copa Grupos');
    assert.equal(await exists(driver, '#generate-knockout'), false);
    await saveResult(ids.lastGroupGame, { score_a: '0', score_b: '1' });
    await click(driver, '#generate-knockout');
    await fill(driver, { first_date: formatBrDate(f.inDays(3)) });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.generateDone(1));
    const final = server.db.prepare("SELECT id FROM matches WHERE round = 'Final' AND championship_id = ?").get(f.champId('Copa Grupos')).id;
    // Leoas: 2 vitórias (6 pts); Time Azul e Time Verde: 1 empate e 1 derrota (1 pt) — desempate por saldo: Azul -2, Verde -1.
    assert.equal(await text(driver, `#match-${final} .team-a`), 'Leoas da Serra');
    assert.equal(await text(driver, `#match-${final} .team-b`), 'Time Verde');
    assert.equal(await exists(driver, '#generate-knockout'), false);
  });
});
