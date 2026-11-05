const test = require('node:test');
const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { checkRequest, checkDecision } = require('../../src/validation/registrations');

const championship = (overrides = {}) => ({
  status: 'active', displayStatus: 'open', sport: 'futsal', organizer_id: 1, max_slots: null, allow_waitlist: 0,
  ...overrides,
});

const request = (overrides = {}) => ({
  championship: championship(),
  categoryIds: [10, 11],
  categoryId: 10,
  user: { id: 2 },
  team: { id: 5, sport: 'futsal' },
  approvedInCategory: 0,
  hasOpen: false,
  ...overrides,
});

test('pedido válido fica pendente', () => {
  assert.deepEqual(checkRequest(request()), { error: null, status: 'pending' });
});

test('só aceita campeonato em inscrição (inclui o dia do prazo, que ainda é "open")', () => {
  for (const displayStatus of ['in_progress', 'finished', 'cancelled']) {
    assert.equal(checkRequest(request({ championship: championship({ displayStatus }) })).error, MESSAGES.registrationClosed);
  }
});

test('organizador não se inscreve no próprio campeonato', () => {
  assert.equal(checkRequest(request({ user: { id: 1 } })).error, MESSAGES.registrationOwnChampionship);
});

test('categoria precisa ser do campeonato', () => {
  assert.equal(checkRequest(request({ categoryId: 99 })).error, MESSAGES.required);
});

test('modalidade da equipe deve ser a do campeonato', () => {
  assert.equal(checkRequest(request({ team: { id: 5, sport: 'volleyball' } })).error, MESSAGES.registrationSportMismatch);
  assert.equal(checkRequest(request({ team: null })).error, MESSAGES.registrationSportMismatch);
});

test('corrida de rua é individual: sem equipe', () => {
  const run = championship({ sport: 'street_run' });
  assert.deepEqual(checkRequest(request({ championship: run, team: null })), { error: null, status: 'pending' });
  assert.equal(checkRequest(request({ championship: run })).error, MESSAGES.registrationSportMismatch);
});

test('não repete pedido ativo na mesma categoria', () => {
  assert.equal(checkRequest(request({ hasOpen: true })).error, MESSAGES.registrationDuplicate);
});

test('vagas esgotadas sem lista de espera', () => {
  const full = championship({ max_slots: 2 });
  assert.deepEqual(checkRequest(request({ championship: full, approvedInCategory: 2 })),
    { error: MESSAGES.registrationFull, status: null });
  assert.equal(checkRequest(request({ championship: full, approvedInCategory: 1 })).status, 'pending');
});

test('vagas esgotadas com lista de espera', () => {
  const full = championship({ max_slots: 2, allow_waitlist: 1 });
  assert.deepEqual(checkRequest(request({ championship: full, approvedInCategory: 2 })), { error: null, status: 'waitlist' });
});

test('sem número máximo de vagas nunca esgota', () => {
  assert.equal(checkRequest(request({ approvedInCategory: 500 })).status, 'pending');
});

const decision = (overrides = {}) => ({
  championship: championship({ displayStatus: 'in_progress' }),
  registration: { status: 'pending' },
  approvedInCategory: 0,
  action: 'approve',
  ...overrides,
});

test('aprova ou recusa pendente de campeonato ativo, mesmo após o prazo', () => {
  assert.equal(checkDecision(decision()), null);
  assert.equal(checkDecision(decision({ action: 'refuse' })), null);
});

test('campeonato encerrado ou cancelado não aceita análise', () => {
  for (const status of ['finished', 'cancelled']) {
    assert.equal(checkDecision(decision({ championship: championship({ status }) })), MESSAGES.registrationReviewClosed);
  }
});

test('só analisa pendente ou lista de espera', () => {
  for (const status of ['approved', 'refused', 'cancelled']) {
    assert.equal(checkDecision(decision({ registration: { status } })), MESSAGES.registrationAlreadyDecided);
  }
  assert.equal(checkDecision(decision({ registration: { status: 'waitlist' } })), null);
});

test('não aprova além das vagas, mas pode recusar', () => {
  const full = championship({ max_slots: 1 });
  assert.equal(checkDecision(decision({ championship: full, approvedInCategory: 1 })), MESSAGES.registrationNoSlots);
  assert.equal(checkDecision(decision({ championship: full, approvedInCategory: 1, action: 'refuse' })), null);
  assert.equal(checkDecision(decision({ championship: full, approvedInCategory: 0, registration: { status: 'waitlist' } })),
    null);
});
