const test = require('node:test');
const assert = require('node:assert/strict');
const { groupByCategory, csvField, toCsv } = require('../../src/rules/report');

test('relatório agrupa por categoria, na ordem das categorias, com totais por status', () => {
  const groups = groupByCategory([{ id: 1, name: 'Adulto' }, { id: 2, name: 'Sub-17' }, { id: 3, name: 'Master' }], [
    { category_id: 2, status: 'approved' }, { category_id: 1, status: 'pending' }, { category_id: 1, status: 'approved' },
  ]);
  assert.deepEqual(groups.map((g) => g.name), ['Adulto', 'Sub-17']);
  assert.equal(groups[0].totals.pending, 1);
  assert.equal(groups[0].totals.approved, 1);
  assert.equal(groups[0].totals.refused, 0);
});

test('campo CSV com separador, aspas, quebra de linha e início de fórmula', () => {
  assert.equal(csvField('Leoas da Serra'), 'Leoas da Serra');
  assert.equal(csvField('Time "Aspas"; FC'), '"Time ""Aspas""; FC"');
  assert.equal(csvField('linha 1\nlinha 2'), '"linha 1\nlinha 2"');
  assert.equal(csvField('=SOMA(A1)'), "'=SOMA(A1)");
  assert.equal(csvField(null), '');
});

test('CSV com BOM, ponto e vírgula e CRLF', () => {
  assert.equal(toCsv(['A', 'B'], [['1', 'Vôlei']]), '\uFEFFA;B\r\n1;Vôlei\r\n');
});
