const test = require('node:test');
const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { validateChampionshipInput, parseCategories } = require('../../src/validation/championships');

const CITY_IDS = [1, 2];

const valid = (overrides = {}) => ({
  name: 'Copa Teste',
  sport: 'volleyball',
  categories: 'Adulto, Sub-20',
  city_id: '1',
  venue: 'Ginásio Teste',
  start_date: '10/12/2026',
  end_date: '15/12/2026',
  registration_deadline: '01/12/2026',
  format: 'round_robin',
  max_slots: '',
  rules: '',
  contact: '',
  ...overrides,
});

const validate = (input) => validateChampionshipInput(input, { cityIds: CITY_IDS });

test('campeonato válido gera dados normalizados', () => {
  const { errors, data } = validate(valid({ name: '  Copa Teste ', max_slots: '12', rules: ' Regras ' }));
  assert.deepEqual(errors, {});
  assert.deepEqual(data, {
    name: 'Copa Teste',
    sport: 'volleyball',
    categories: ['Adulto', 'Sub-20'],
    cityId: 1,
    venue: 'Ginásio Teste',
    startDate: '2026-12-10',
    endDate: '2026-12-15',
    registrationDeadline: '2026-12-01',
    format: 'round_robin',
    maxSlots: 12,
    rules: 'Regras',
    contact: null,
  });
});

test('campos obrigatórios', () => {
  const { errors } = validate({});
  for (const field of ['name', 'sport', 'city_id', 'venue', 'start_date', 'end_date', 'registration_deadline', 'format']) {
    assert.equal(errors[field], MESSAGES.required, field);
  }
  assert.equal(errors.categories, MESSAGES.categoriesRequired);
});

test('data de término antes do início', () => {
  assert.equal(validate(valid({ end_date: '09/12/2026' })).errors.end_date, MESSAGES.endBeforeStart);
});

test('término no mesmo dia do início é válido', () => {
  assert.deepEqual(validate(valid({ end_date: '10/12/2026' })).errors, {});
});

test('prazo de inscrição depois do início', () => {
  assert.equal(validate(valid({ registration_deadline: '11/12/2026' })).errors.registration_deadline, MESSAGES.deadlineAfterStart);
});

test('prazo de inscrição igual ao início é válido', () => {
  assert.deepEqual(validate(valid({ registration_deadline: '10/12/2026' })).errors, {});
});

test('data inexistente', () => {
  const { errors } = validate(valid({ start_date: '31/02/2026' }));
  assert.equal(errors.start_date, MESSAGES.dateInvalid);
  assert.equal(errors.end_date, undefined, 'não compara com data inválida');
});

test('data em outro formato', () => {
  assert.equal(validate(valid({ end_date: '2026-12-15' })).errors.end_date, MESSAGES.dateInvalid);
});

test('prova individual fora da corrida de rua', () => {
  assert.equal(validate(valid({ sport: 'football', format: 'individual' })).errors.format, MESSAGES.individualOnlyRun);
});

test('corrida de rua com formato de equipe', () => {
  assert.equal(validate(valid({ sport: 'street_run', format: 'knockout' })).errors.format, MESSAGES.runOnlyIndividual);
});

test('corrida de rua com prova individual é válida', () => {
  assert.deepEqual(validate(valid({ sport: 'street_run', format: 'individual' })).errors, {});
});

test('número de vagas inválido', () => {
  for (const v of ['0', '2.5', 'abc', '-3']) {
    assert.equal(validate(valid({ max_slots: v })).errors.max_slots, MESSAGES.slotsInvalid, v);
  }
  assert.equal(validate(valid({ max_slots: '' })).data.maxSlots, null);
});

test('categorias vazias', () => {
  assert.equal(validate(valid({ categories: ' , ' })).errors.categories, MESSAGES.categoriesRequired);
});

test('modalidade, formato e cidade fora da lista', () => {
  const { errors } = validate(valid({ sport: 'chess', format: 'swiss', city_id: '99' }));
  assert.equal(errors.sport, MESSAGES.required);
  assert.equal(errors.format, MESSAGES.required);
  assert.equal(errors.city_id, MESSAGES.required);
});

test('parseCategories remove vazios e duplicados', () => {
  assert.deepEqual(parseCategories('Adulto, sub-17, adulto,'), ['Adulto', 'sub-17']);
});
