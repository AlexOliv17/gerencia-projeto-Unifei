const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { formatBrDate, parseTime } = require('../../src/validation/dates');
const { saveRaceStart } = require('../../src/models/races');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const { fixtures } = require('./support/fixtures');
const {
  visit, fill, submit, click, flash, fieldError, text, texts, exists, login, logout,
} = require('./support/ui');

const ORGANIZER = 'organizador@arenalocal.com';

describe('RFS09 regra 4 / RFS10 - Largadas e tempos da corrida de rua', function () {
  let server;
  let driver;
  let f;
  const ids = {};

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    f = fixtures(server.db);
    f.championship('Corrida Teste', {
      sport: 'street_run', format: 'individual', categories: ['5 km', '10 km', 'Kids'],
      startDate: f.inDays(-1), endDate: f.inDays(5), registrationDeadline: f.inDays(-3),
    });
    ids.joao = f.register('Corrida Teste', null, { category: '5 km', user: 'usuario@arenalocal.com' });
    ids.maria = f.register('Corrida Teste', null, { category: '5 km', user: 'capita@arenalocal.com' });
    const champ = f.champId('Corrida Teste');
    for (const category of ['5 km', 'Kids']) {
      saveRaceStart(server.db, champ, f.categoryId('Corrida Teste', category), {
        date: f.inDays(-1), startTime: parseTime('07:00'), venue: 'Praça Central',
      });
    }
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  const racesPath = (champ) => `/my/championships/${f.champId(champ)}/races`;
  const category = (name, champ = 'Corrida Teste') => f.categoryId(champ, name);

  async function openRaces(champ = 'Corrida Teste') {
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, racesPath(champ));
  }

  it('cadastra a largada de uma categoria', async function () {
    await openRaces();
    assert.equal(await text(driver, `#race-${category('10 km')} .status`), 'Sem largada');
    await click(driver, `#start-${category('10 km')}`);
    await fill(driver, { start_date: formatBrDate(f.inDays(2)), start_time: '08:30', venue: 'Avenida Principal' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.raceSaved);
    assert.equal(await text(driver, `#race-${category('10 km')} .time`), '08:30');
    assert.equal(await text(driver, `#race-${category('10 km')} .status`), 'Agendada');
  });

  it('recusa largada fora do período e horário inválido', async function () {
    await openRaces();
    await click(driver, `#start-${category('10 km')}`);
    await fill(driver, { start_date: formatBrDate(f.inDays(20)), start_time: '8h' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'start_date'), MESSAGES.dateOutsidePeriod);
    assert.equal(await fieldError(driver, 'start_time'), MESSAGES.timeInvalid);
  });

  it('registra e corrige tempos; o ranking público segue o menor tempo', async function () {
    await openRaces();
    await click(driver, `#times-${category('5 km')}`);
    assert.deepEqual(await texts(driver, 'tr[data-testid="runner-row"] .name'), ['João Torcedor', 'Maria Capitã']);
    await fill(driver, { [`time_${ids.joao}`]: '00:25:30', [`time_${ids.maria}`]: '0:24:10' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.raceTimesSaved(2));

    const publicPath = `/championships/${f.champId('Corrida Teste')}/table?category_id=${category('5 km')}`;
    await visit(driver, server.baseUrl, publicPath);
    assert.deepEqual(await texts(driver, 'tr[data-testid="ranking-row"] .name'), ['Maria Capitã', 'João Torcedor']);
    assert.deepEqual(await texts(driver, 'tr[data-testid="ranking-row"] .time'), ['00:24:10', '00:25:30']);

    await visit(driver, server.baseUrl, racesPath('Corrida Teste'));
    await click(driver, `#times-${category('5 km')}`);
    await fill(driver, { [`time_${ids.joao}`]: '00:23:00' });
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.raceTimesSaved(1));
    await click(driver, `#times-${category('5 km')}`);
    assert.equal(await text(driver, 'li[data-testid="history-entry"] .what'), 'Tempo corrigido: João Torcedor 00:25:30 → 00:23:00');

    await visit(driver, server.baseUrl, publicPath);
    assert.deepEqual(await texts(driver, 'tr[data-testid="ranking-row"] .position'), ['1', '2']);
    assert.deepEqual(await texts(driver, 'tr[data-testid="ranking-row"] .name'), ['João Torcedor', 'Maria Capitã']);
  });

  it('recusa tempo em formato inválido', async function () {
    await openRaces();
    await click(driver, `#times-${category('5 km')}`);
    await fill(driver, { [`time_${ids.maria}`]: '24min' });
    await submit(driver);
    assert.equal(await fieldError(driver, `time_${ids.maria}`), MESSAGES.finishTimeInvalid);
  });

  it('não registra tempos antes da data da largada', async function () {
    const corrida = 'Corrida Rústica de Pouso Alegre';
    await openRaces(corrida);
    assert.equal(await text(driver, `#race-${category('5 km', corrida)} .status`), 'Agendada');
    assert.equal(await exists(driver, `#times-${category('5 km', corrida)}`), false);
    await visit(driver, server.baseUrl, `${racesPath(corrida)}/${category('5 km', corrida)}/results`);
    assert.equal(await flash(driver), MESSAGES.raceTooEarly);
  });

  it('cancela a largada, e a página pública mostra o cancelamento', async function () {
    await openRaces();
    await click(driver, `#cancel-start-${category('Kids')}`);
    await click(driver, '#confirm-cancel');
    assert.equal(await flash(driver), MESSAGES.raceCancelled);
    assert.equal(await text(driver, `#race-${category('Kids')} .status`), 'Cancelada');
    await visit(driver, server.baseUrl, `/championships/${f.champId('Corrida Teste')}/table?category_id=${category('Kids')}`);
    assert.equal(await text(driver, '#race-start'), 'Largada cancelada.');
  });
});
