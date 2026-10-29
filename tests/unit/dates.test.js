const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBrDate, formatBrDate, addDaysIso, todayIso } = require('../../src/validation/dates');

test('parseBrDate aceita DD/MM/AAAA', () => {
  assert.equal(parseBrDate('05/11/2026'), '2026-11-05');
});

test('parseBrDate rejeita data inexistente', () => {
  assert.equal(parseBrDate('31/02/2026'), null);
});

test('parseBrDate rejeita outros formatos', () => {
  for (const s of ['1/2/26', '2026-12-01', '', '  ', '32/01/2026', '10/13/2026', undefined, null]) {
    assert.equal(parseBrDate(s), null, `aceitou ${JSON.stringify(s)}`);
  }
});

test('parseBrDate tolera espaços nas pontas', () => {
  assert.equal(parseBrDate(' 01/12/2026 '), '2026-12-01');
});

test('parseBrDate aceita 29/02 em ano bissexto', () => {
  assert.equal(parseBrDate('29/02/2028'), '2028-02-29');
});

test('formatBrDate', () => {
  assert.equal(formatBrDate('2026-11-05'), '05/11/2026');
});

test('addDaysIso cruza mês', () => {
  assert.equal(addDaysIso('2026-10-28', 5), '2026-11-02');
});

test('addDaysIso aceita negativos', () => {
  assert.equal(addDaysIso('2026-03-01', -1), '2026-02-28');
});

test('todayIso usa a data local', () => {
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(todayIso(), expected);
});
