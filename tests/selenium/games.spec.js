const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { formatBrDate } = require('../../src/validation/dates');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const { fixtures } = require('./support/fixtures');
const {
  visit, fill, selectByText, submit, click, flash, fieldError, text, texts, exists, login, logout, forgePost,
} = require('./support/ui');

const ORGANIZER = 'organizador@arenalocal.com';

describe('RFS09 - Manter Tabela de Jogos', function () {
  let server;
  let driver;
  let f;
  let pendingEntry;
  let roxoEntry;
  let rescheduleId;
  let cancelId;
  let rainFinal;

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    f = fixtures(server.db);
    for (const name of ['Time Azul', 'Time Verde', 'Time Roxo']) f.team(name);
    f.championship('Copa Manual');
    for (const name of ['Leoas da Serra', 'Time Azul', 'Time Verde']) f.register('Copa Manual', name);
    pendingEntry = f.register('Copa Manual', 'Unidos de Itajubá', { status: 'pending' });
    roxoEntry = f.register('Copa Manual', 'Time Roxo');
    const entry = (name) => server.db.prepare(`SELECT r.id FROM registrations r JOIN teams t ON t.id = r.team_id
      WHERE r.championship_id = ? AND t.name = ?`).get(f.champId('Copa Manual'), name).id;
    f.game('Copa Manual', entry('Leoas da Serra'), entry('Time Verde'), { day: 30, time: '19:00', round: 'Rodada 2' });
    rescheduleId = f.game('Copa Manual', entry('Time Azul'), entry('Time Verde'), { day: 40, round: 'Rodada 3' });
    cancelId = f.game('Copa Manual', entry('Time Azul'), entry('Leoas da Serra'), { day: 45, round: 'Rodada 4' });
    f.championship('Copa Pontos Corridos');
    for (const name of ['Leoas da Serra', 'Time Azul', 'Time Verde', 'Time Roxo']) f.register('Copa Pontos Corridos', name);
    f.championship('Copa Chave', { format: 'knockout' });
    for (const name of ['Leoas da Serra', 'Time Azul', 'Time Verde']) f.register('Copa Chave', name);
    f.championship('Copa Chuva', { format: 'knockout' });
    const [cLeoas, cAzul, cVerde, cRoxo] = ['Leoas da Serra', 'Time Azul', 'Time Verde', 'Time Roxo']
      .map((t) => f.register('Copa Chuva', t));
    rainFinal = f.game('Copa Chuva', null, null, { day: 20, round: 'Final', kind: 'knockout' });
    f.game('Copa Chuva', cLeoas, cRoxo, { day: 13, time: '08:00', round: 'Semifinal', kind: 'knockout', next: rainFinal, slot: 'a' });
    f.game('Copa Chuva', cAzul, cVerde, { day: 13, time: '10:00', round: 'Semifinal', kind: 'knockout', next: rainFinal, slot: 'b' });
    f.championship('Copa Encerrada');
    server.db.prepare("UPDATE championships SET status = 'finished' WHERE name = 'Copa Encerrada'").run();
    // Another championship where Time Roxo already plays at 20:00 in 12 days (rule 1 crosses championships).
    f.championship('Copa Vizinha', {}, 'organizador@arenalocal.com');
    const roxo = f.register('Copa Vizinha', 'Time Roxo');
    const azul = f.register('Copa Vizinha', 'Time Azul');
    f.game('Copa Vizinha', roxo, azul, { day: 12, time: '20:00', venue: 'Quadra Vizinha' });
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  const tablePath = (champ) => `/my/championships/${f.champId(champ)}/games`;
  const rows = () => texts(driver, 'tr[data-testid="match-row"] .round');

  async function openNewMatch(champ) {
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, tablePath(champ));
    await click(driver, '#new-match');
  }

  async function fillMatch({ a = 'Leoas da Serra', b = 'Time Azul', day = 10, time = '19:00', venue = 'Ginásio Teste', round = 'Rodada 1' } = {}) {
    await fill(driver, { round, match_date: formatBrDate(f.inDays(day)), start_time: time, venue });
    await selectByText(driver, 'registration_a_id', a);
    await selectByText(driver, 'registration_b_id', b);
  }

  it('cadastra jogo e mostra na tabela da categoria', async function () {
    await openNewMatch('Copa Manual');
    await fillMatch();
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.matchCreated);
    const created = server.db.prepare("SELECT id FROM matches WHERE championship_id = ? AND round = 'Rodada 1'")
      .get(f.champId('Copa Manual')).id;
    assert.equal(await text(driver, `#match-${created} .team-a`), 'Leoas da Serra');
    assert.equal(await text(driver, `#match-${created} .team-b`), 'Time Azul');
    assert.equal(await text(driver, `#match-${created} .date`), formatBrDate(f.inDays(10)));
    assert.equal(await text(driver, `#match-${created} .status`), 'Agendado');
  });

  it('só oferece equipes aprovadas e recusa inscrição pendente por POST forjado (regra 3)', async function () {
    await openNewMatch('Copa Manual');
    const options = await texts(driver, '#registration_a_id option');
    assert.deepEqual(options, ['Selecione', 'Leoas da Serra', 'Time Azul', 'Time Roxo', 'Time Verde']);
    await forgePost(driver, `${tablePath('Copa Manual')}/new`, {
      category_id: f.categoryId('Copa Manual', 'Única'), round: 'Rodada 9', registration_a_id: pendingEntry,
      registration_b_id: roxoEntry, match_date: formatBrDate(f.inDays(20)), start_time: '10:00',
      venue: 'Ginásio Teste',
    });
    assert.equal(await fieldError(driver, 'registration_a_id'), MESSAGES.matchTeamNotApproved);
  });

  it('recusa equipe com outro jogo no mesmo horário, inclusive em outro campeonato (regra 1)', async function () {
    await openNewMatch('Copa Manual');
    await fillMatch({ a: 'Time Roxo', b: 'Time Verde', day: 12, time: '20:30', venue: 'Outro Ginásio' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'start_time'),
      MESSAGES.matchTeamBusy('Time Roxo', formatBrDate(f.inDays(12)), '20:00'));
  });

  it('recusa dois jogos sobrepostos no mesmo local (regra 2)', async function () {
    await openNewMatch('Copa Manual');
    await fillMatch({ a: 'Time Azul', b: 'Time Roxo', day: 30, time: '19:30', venue: ' ginásio  teste ' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'venue'), MESSAGES.matchVenueBusy(formatBrDate(f.inDays(30)), '19:00'));
  });

  it('recusa data fora do período e equipes iguais', async function () {
    await openNewMatch('Copa Manual');
    await fillMatch({ a: 'Time Verde', b: 'Time Verde', day: 90 });
    await submit(driver);
    assert.equal(await fieldError(driver, 'match_date'), MESSAGES.dateOutsidePeriod);
    assert.equal(await fieldError(driver, 'registration_b_id'), MESSAGES.matchSameTeams);
  });

  it('reagenda o jogo', async function () {
    const id = rescheduleId;
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, tablePath('Copa Manual'));
    await click(driver, `#edit-match-${id}`);
    await fill(driver, { match_date: formatBrDate(f.inDays(15)), start_time: '21:00' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.matchSaved);
    assert.equal(await text(driver, `#match-${id} .date`), formatBrDate(f.inDays(15)));
    assert.equal(await text(driver, `#match-${id} .time`), '21:00');
  });

  it('cancela o jogo, que continua na lista como cancelado', async function () {
    const id = cancelId;
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, tablePath('Copa Manual'));
    await click(driver, `#cancel-match-${id}`);
    await click(driver, '#confirm-cancel');
    assert.equal(await flash(driver), MESSAGES.matchCancelled);
    assert.equal(await text(driver, `#match-${id} .status`), 'Cancelado');
    assert.equal(await exists(driver, `#edit-match-${id}`), false);
  });

  it('gera pontos corridos: todos contra todos, uma rodada por data', async function () {
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, tablePath('Copa Pontos Corridos'));
    await click(driver, '#generate-table');
    await fill(driver, { first_date: formatBrDate(f.inDays(7)), first_time: '18:00', duration_minutes: '50' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.generateDone(6));
    assert.deepEqual(await rows(), ['Rodada 1', 'Rodada 1', 'Rodada 2', 'Rodada 2', 'Rodada 3', 'Rodada 3']);
    assert.deepEqual(await texts(driver, 'tr[data-testid="match-row"] .time'), ['18:00', '18:50', '18:00', '18:50', '18:00', '18:50']);
    const dates = await texts(driver, 'tr[data-testid="match-row"] .date');
    assert.deepEqual([...new Set(dates)], [7, 14, 21].map((d) => formatBrDate(f.inDays(d))));
  });

  it('não gera de novo uma categoria que já tem jogos', async function () {
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, `${tablePath('Copa Pontos Corridos')}/generate`);
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.generateHasMatches);
  });

  it('gera o chaveamento do mata-mata com folga e final "A definir"', async function () {
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, `${tablePath('Copa Chave')}/generate`);
    // 08:00 keeps clear of the Copa Pontos Corridos games of the same teams that day (rule 1).
    await fill(driver, { first_date: formatBrDate(f.inDays(7)), first_time: '08:00' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.generateDone(2));
    assert.deepEqual(await rows(), ['Semifinal', 'Final']);
    assert.deepEqual(await texts(driver, 'tr[data-testid="match-row"] .team-a'), ['Time Azul', 'Leoas da Serra']);
    assert.deepEqual(await texts(driver, 'tr[data-testid="match-row"] .team-b'), ['Time Verde', 'A definir']);
  });

  it('reagenda a final do chaveamento ainda "A definir"; as equipes vêm dos jogos anteriores (BUG-R3-01)', async function () {
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, tablePath('Copa Chuva'));
    await click(driver, `#edit-match-${rainFinal}`);
    assert.equal(await exists(driver, '#registration_a_id'), false);
    assert.equal(await text(driver, '#locked-teams'), 'A definir x A definir (definidas pelo chaveamento)');
    await fill(driver, { match_date: formatBrDate(f.inDays(25)), start_time: '16:00' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.matchSaved);
    assert.equal(await text(driver, `#match-${rainFinal} .date`), formatBrDate(f.inDays(25)));
    assert.equal(await text(driver, `#match-${rainFinal} .team-a`), 'A definir');
  });

  it('POST forjado não troca as equipes de um jogo do chaveamento (BUG-R3-01)', async function () {
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, tablePath('Copa Chuva'));
    const azul = server.db.prepare(`SELECT r.id FROM registrations r JOIN teams t ON t.id = r.team_id
      WHERE r.championship_id = ? AND t.name = 'Time Azul'`).get(f.champId('Copa Chuva')).id;
    await forgePost(driver, `/games/${rainFinal}/edit`, {
      category_id: f.categoryId('Copa Chuva', 'Única'), round: 'Final', registration_a_id: azul, registration_b_id: '',
      match_date: formatBrDate(f.inDays(25)), start_time: '16:00', venue: 'Ginásio Teste',
    });
    assert.equal(await flash(driver), MESSAGES.matchSaved);
    const final = server.db.prepare('SELECT registration_a_id, registration_b_id FROM matches WHERE id = ?').get(rainFinal);
    assert.deepEqual({ ...final }, { registration_a_id: null, registration_b_id: null });
  });

  it('não muda o formato do campeonato depois de haver jogos (BUG-R3-02)', async function () {
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, `/my/championships/${f.champId('Copa Manual')}/edit`);
    await selectByText(driver, 'format', 'Mata-mata');
    await submit(driver);
    assert.equal(await fieldError(driver, 'format'), MESSAGES.championshipFormatLocked);
    assert.equal(server.db.prepare("SELECT format FROM championships WHERE name = 'Copa Manual'").get().format, 'round_robin');
  });

  it('campeonato encerrado: tabela só para consulta, inclusive contra POST forjado', async function () {
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, tablePath('Copa Encerrada'));
    assert.equal(await text(driver, '#table-closed'), MESSAGES.tableClosed);
    assert.equal(await exists(driver, '#new-match'), false);
    await forgePost(driver, `${tablePath('Copa Encerrada')}/new`, { round: 'Rodada 1' });
    assert.equal(await flash(driver), MESSAGES.tableClosed);
  });
});
