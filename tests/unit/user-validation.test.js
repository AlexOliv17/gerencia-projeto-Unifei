const test = require('node:test');
const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const {
  normalizeEmail, isValidEmail, normalizeDocument, validateUserInput,
} = require('../../src/validation/users');

const CITY_IDS = [1, 2];

const validUser = (overrides = {}) => ({
  name: 'Maria Atleta',
  email: 'maria@exemplo.com',
  password: 'Senha@123',
  password_confirm: 'Senha@123',
  city_id: '1',
  role: 'user',
  ...overrides,
});

const register = (input) => validateUserInput(input, { mode: 'register', cityIds: CITY_IDS });

test('normalizeDocument aceita CPF com pontuação', () => {
  assert.equal(normalizeDocument('123.456.789-01'), '12345678901');
});

test('normalizeDocument aceita CNPJ com pontuação', () => {
  assert.equal(normalizeDocument('12.345.678/0001-90'), '12345678000190');
});

test('normalizeDocument rejeita tamanhos diferentes de 11 e 14', () => {
  for (const s of ['123', '123456789012', '', undefined]) assert.equal(normalizeDocument(s), null);
});

test('isValidEmail', () => {
  assert.equal(isValidEmail('a@b.com'), true);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail('a b@c.com'), false);
});

test('normalizeEmail remove espaços e baixa a caixa', () => {
  assert.equal(normalizeEmail('  Usuario@ArenaLocal.com '), 'usuario@arenalocal.com');
});

test('cadastro válido de usuário comum', () => {
  const { errors, data } = register(validUser({ name: '  Maria Atleta ', email: ' Maria@Exemplo.com' }));
  assert.deepEqual(errors, {});
  assert.equal(data.name, 'Maria Atleta');
  assert.equal(data.email, 'maria@exemplo.com');
  assert.equal(data.cityId, 1);
  assert.equal(data.role, 'user');
  assert.equal(data.status, 'active');
  assert.equal(data.document, null);
});

test('organizador nasce pendente com documento normalizado', () => {
  const { errors, data } = register(validUser({ role: 'organizer', document: '123.456.789-01', league_name: 'Liga Teste' }));
  assert.deepEqual(errors, {});
  assert.equal(data.status, 'pending');
  assert.equal(data.document, '12345678901');
  assert.equal(data.leagueName, 'Liga Teste');
});

test('autocadastro não aceita perfil administrador', () => {
  assert.equal(register(validUser({ role: 'admin' })).errors.role, MESSAGES.required);
});

test('organizador sem documento', () => {
  assert.equal(register(validUser({ role: 'organizer', league_name: 'Liga' })).errors.document, MESSAGES.documentInvalid);
});

test('organizador sem nome da liga', () => {
  assert.equal(register(validUser({ role: 'organizer', document: '12345678901' })).errors.league_name, MESSAGES.required);
});

test('senha curta', () => {
  const { errors } = register(validUser({ password: '1234567', password_confirm: '1234567' }));
  assert.equal(errors.password, MESSAGES.passwordShort);
});

test('confirmação de senha diferente', () => {
  assert.equal(register(validUser({ password_confirm: 'Outra@123' })).errors.password_confirm, MESSAGES.passwordMismatch);
});

test('campos obrigatórios vazios', () => {
  const { errors } = register({});
  assert.equal(errors.name, MESSAGES.required);
  assert.equal(errors.email, MESSAGES.required);
  assert.equal(errors.password, MESSAGES.required);
  assert.equal(errors.city_id, MESSAGES.required);
  assert.equal(errors.role, MESSAGES.required);
});

test('e-mail inválido', () => {
  assert.equal(register(validUser({ email: 'maria@' })).errors.email, MESSAGES.emailInvalid);
});

test('cidade inexistente', () => {
  assert.equal(register(validUser({ city_id: '99' })).errors.city_id, MESSAGES.required);
});

test('admin pode cadastrar administrador com status escolhido', () => {
  const { errors, data } = validateUserInput(validUser({ role: 'admin', status: 'active' }), { mode: 'adminCreate', cityIds: CITY_IDS });
  assert.deepEqual(errors, {});
  assert.equal(data.role, 'admin');
  assert.equal(data.status, 'active');
});

test('edição pelo admin não exige senha', () => {
  const input = validUser({ password: '', password_confirm: '', status: 'suspended' });
  const { errors, data } = validateUserInput(input, { mode: 'adminEdit', cityIds: CITY_IDS });
  assert.deepEqual(errors, {});
  assert.equal(data.status, 'suspended');
  assert.equal('password' in data, false);
});

test('perfil próprio usa o papel atual e não aceita troca de papel', () => {
  const input = { name: 'Carlos', email: 'c@x.com', city_id: '1', role: 'admin', document: '', league_name: 'Liga' };
  const { errors, data } = validateUserInput(input, { mode: 'profile', role: 'organizer', cityIds: CITY_IDS });
  assert.equal(errors.document, MESSAGES.documentInvalid);
  assert.equal('role' in data, false);
});
