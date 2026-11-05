const test = require('node:test');
const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { parseAthletes, validateTeamInput } = require('../../src/validation/teams');

const CITY_IDS = [1, 2];

const valid = (overrides = {}) => ({
  name: 'Unidos',
  sport: 'futsal',
  city_id: '1',
  athletes: 'Ana Souza; 10\nBia Lima; 7',
  ...overrides,
});

test('lê um atleta por linha, ignorando linhas em branco e espaços', () => {
  assert.deepEqual(parseAthletes('Ana Souza; 10\n\n  Bia; 7 \r\n'), {
    athletes: [{ name: 'Ana Souza', number: '10' }, { name: 'Bia', number: '7' }],
    error: null,
  });
});

test('linha sem ponto e vírgula aponta a linha', () => {
  assert.equal(parseAthletes('Ana Souza 10').error, MESSAGES.athleteLineInvalid(1));
});

test('linha sem número aponta a linha', () => {
  assert.equal(parseAthletes('Ana; 10\n\nBia; ').error, MESSAGES.athleteLineInvalid(3));
});

test('linha sem nome aponta a linha', () => {
  assert.equal(parseAthletes('; 10').error, MESSAGES.athleteLineInvalid(1));
});

test('número repetido na mesma equipe aponta a linha', () => {
  assert.equal(parseAthletes('Ana; 10\nBia; 10').error, MESSAGES.athleteNumberRepeated(2));
});

test('lista vazia exige ao menos um atleta', () => {
  assert.equal(parseAthletes('  \n ').error, MESSAGES.athletesRequired);
  assert.equal(parseAthletes(undefined).error, MESSAGES.athletesRequired);
});

test('mais de 30 atletas é rejeitado', () => {
  const lines = Array.from({ length: 31 }, (_, i) => `Atleta ${i}; ${i}`).join('\n');
  assert.equal(parseAthletes(lines).error, MESSAGES.athletesTooMany);
  assert.equal(parseAthletes(lines.split('\n').slice(0, 30).join('\n')).error, null);
});

test('equipe válida gera dados normalizados', () => {
  const { errors, data } = validateTeamInput(valid({ name: '  Unidos ' }), { cityIds: CITY_IDS });
  assert.deepEqual(errors, {});
  assert.deepEqual(data, {
    name: 'Unidos',
    sport: 'futsal',
    cityId: 1,
    athletes: [{ name: 'Ana Souza', number: '10' }, { name: 'Bia Lima', number: '7' }],
  });
});

test('corrida de rua não é modalidade de equipe', () => {
  const { errors } = validateTeamInput(valid({ sport: 'street_run' }), { cityIds: CITY_IDS });
  assert.equal(errors.sport, MESSAGES.teamSportInvalid);
});

test('nome e cidade são obrigatórios', () => {
  const { errors } = validateTeamInput(valid({ name: ' ', city_id: '9' }), { cityIds: CITY_IDS });
  assert.equal(errors.name, MESSAGES.required);
  assert.equal(errors.city_id, MESSAGES.required);
});

test('erro da lista de atletas vai para o campo atletas', () => {
  const { errors } = validateTeamInput(valid({ athletes: 'Ana' }), { cityIds: CITY_IDS });
  assert.equal(errors.athletes, MESSAGES.athleteLineInvalid(1));
});
