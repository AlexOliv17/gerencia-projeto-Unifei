const test = require('node:test');
const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const {
  validateMatchInput, validateGenerateInput, validateResultInput, parseFinishTime, formatFinishTime,
} = require('../../src/validation/games');
const { parseTime } = require('../../src/validation/dates');

const championship = { format: 'round_robin', start_date: '2026-12-01', end_date: '2026-12-20' };
const entries = new Map([[10, [{ id: 1, name: 'Alfa' }, { id: 2, name: 'Beta' }]], [11, [{ id: 3, name: 'Gama' }]]]);
const context = (overrides = {}) => ({ championship: { ...championship, ...overrides }, categoryIds: [10, 11], entries });

const match = (overrides = {}) => ({
  category_id: '10', round: 'Rodada 1', group_name: '', registration_a_id: '1', registration_b_id: '2',
  match_date: '05/12/2026', start_time: '19:30', duration_minutes: '', venue: 'Ginásio', ...overrides,
});

test('jogo válido', () => {
  const { errors, data } = validateMatchInput(match(), context());
  assert.deepEqual(errors, {});
  assert.deepEqual(data, {
    categoryId: 10, round: 'Rodada 1', groupName: null, kind: 'league', registrationAId: 1, registrationBId: 2,
    date: '2026-12-05', startTime: 1170, duration: 60, venue: 'Ginásio',
  });
});

test('regra 3: só equipes aprovadas na categoria', () => {
  const { errors } = validateMatchInput(match({ registration_b_id: '3' }), context());
  assert.equal(errors.registration_b_id, MESSAGES.matchTeamNotApproved);
});

test('equipes iguais, data fora do período, horário e duração inválidos', () => {
  const { errors } = validateMatchInput(match({
    registration_b_id: '1', match_date: '21/12/2026', start_time: '24:00', duration_minutes: '5',
  }), context());
  assert.equal(errors.registration_b_id, MESSAGES.matchSameTeams);
  assert.equal(errors.match_date, MESSAGES.dateOutsidePeriod);
  assert.equal(errors.start_time, MESSAGES.timeInvalid);
  assert.equal(errors.duration_minutes, MESSAGES.durationInvalid);
});

test('tipo do jogo segue o formato; grupo só em grupos + mata-mata', () => {
  assert.equal(validateMatchInput(match(), context({ format: 'knockout' })).data.kind, 'knockout');
  const groups = context({ format: 'groups_knockout' });
  assert.equal(validateMatchInput(match({ group_name: 'a' }), groups).data.kind, 'league');
  assert.equal(validateMatchInput(match({ group_name: 'a' }), groups).data.groupName, 'A');
  assert.equal(validateMatchInput(match(), groups).data.kind, 'knockout');
  assert.equal(validateMatchInput(match({ group_name: 'A' }), context()).errors.group_name, MESSAGES.matchGroupOnlyGroups);
});

test('campos obrigatórios do jogo', () => {
  const { errors } = validateMatchInput({}, context());
  for (const field of ['category_id', 'round', 'registration_a_id', 'registration_b_id', 'match_date', 'start_time', 'venue']) {
    assert.equal(errors[field], MESSAGES.required, field);
  }
});

test('gerar tabela: intervalo padrão 7 dias e limites', () => {
  const input = { category_id: '10', first_date: '02/12/2026', first_time: '18:00', venue: 'Ginásio' };
  assert.deepEqual(validateGenerateInput(input, context()).data, {
    categoryId: 10, firstDate: '2026-12-02', firstTime: 1080, duration: 60, intervalDays: 7, venue: 'Ginásio',
  });
  assert.equal(validateGenerateInput({ ...input, interval_days: '0' }, context()).errors.interval_days, MESSAGES.intervalInvalid);
});

test('resultado de futebol: empate só fora do mata-mata', () => {
  assert.deepEqual(validateResultInput({ score_a: '1', score_b: '1' }, { sport: 'futsal', kind: 'league' }).errors, {});
  assert.equal(validateResultInput({ score_a: '1', score_b: '1' }, { sport: 'futsal', kind: 'knockout' }).errors.score_b,
    MESSAGES.knockoutDraw);
  assert.equal(validateResultInput({ score_a: '-1', score_b: '' }, { sport: 'futsal', kind: 'league' }).errors.score_a,
    MESSAGES.scoreInvalid);
});

test('resultado de vôlei: sem empate e pontos dos dois lados ou de nenhum', () => {
  const volley = { sport: 'volleyball', kind: 'league' };
  assert.equal(validateResultInput({ score_a: '2', score_b: '2' }, volley).errors.score_b, MESSAGES.volleyDraw);
  assert.equal(validateResultInput({ score_a: '3', score_b: '1', points_a: '75' }, volley).errors.points_b,
    MESSAGES.volleyPointsBoth);
  assert.deepEqual(validateResultInput({ score_a: '3', score_b: '1', points_a: '75', points_b: '60' }, volley).data,
    { scoreA: 3, scoreB: 1, pointsA: 75, pointsB: 60 });
});

test('tempo de chegada HH:MM:SS', () => {
  assert.equal(parseFinishTime('0:25:30'), 1530);
  assert.equal(parseFinishTime('01:02:03'), 3723);
  for (const bad of ['25:30', '00:60:00', '00:00:00', 'abc', '']) assert.equal(parseFinishTime(bad), null, bad);
  assert.equal(formatFinishTime(3723), '01:02:03');
});

test('horário HH:MM', () => {
  assert.equal(parseTime('07:05'), 425);
  assert.equal(parseTime('7:05'), null);
});
