const test = require('node:test');
const assert = require('node:assert/strict');
const {
  roundRobinRounds, splitGroups, bracket, knockoutRoundName, scheduleRounds,
} = require('../../src/rules/schedule');
const { addDaysIso } = require('../../src/validation/dates');

const key = ([a, b]) => [a, b].sort().join('-');

for (const n of [2, 3, 4, 5, 6]) {
  test(`pontos corridos com ${n} equipes: todos se enfrentam uma única vez`, () => {
    const entries = Array.from({ length: n }, (_, i) => `E${i + 1}`);
    const rounds = roundRobinRounds(entries);
    const pairs = rounds.flat();
    assert.equal(pairs.length, (n * (n - 1)) / 2);
    assert.equal(new Set(pairs.map(key)).size, pairs.length);
    assert.equal(rounds.length, n % 2 ? n : n - 1);
    for (const round of rounds) {
      const playing = round.flat();
      assert.equal(new Set(playing).size, playing.length, 'ninguém joga duas vezes na mesma rodada');
    }
  });
}

test('grupos de até 4 equipes, com no máximo uma de diferença', () => {
  assert.deepEqual(splitGroups(['a', 'b', 'c']).map((g) => g.entries), [['a', 'b', 'c']]);
  const five = splitGroups(['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(five.map((g) => g.name), ['A', 'B']);
  assert.deepEqual(five.map((g) => g.entries), [['a', 'c', 'e'], ['b', 'd']]);
  assert.deepEqual(splitGroups(Array.from({ length: 9 }, (_, i) => i)).map((g) => g.entries.length), [3, 3, 3]);
});

test('chaveamento de 4: 1º × 4º e 2º × 3º, vencedores na final', () => {
  const rounds = bracket(['s1', 's2', 's3', 's4']);
  assert.deepEqual(rounds.map((r) => r.length), [2, 1]);
  assert.deepEqual(rounds[0].map((m) => [m.a, m.b]), [['s1', 's4'], ['s2', 's3']]);
  assert.deepEqual(rounds[0].map((m) => m.next), [{ round: 1, index: 0, slot: 'a' }, { round: 1, index: 0, slot: 'b' }]);
  assert.deepEqual(rounds.map((r) => r[0].name), ['Semifinal', 'Final']);
  assert.equal(rounds[1][0].next, null);
});

test('chaveamento com 3 equipes: o 1º folga e já está na final', () => {
  const rounds = bracket(['s1', 's2', 's3']);
  assert.equal(rounds[0][0].bye, true);
  assert.deepEqual([rounds[0][1].a, rounds[0][1].b, rounds[0][1].bye], ['s2', 's3', false]);
  assert.deepEqual([rounds[1][0].a, rounds[1][0].b], ['s1', null]);
});

test('chaveamento com 5 equipes: três folgas e semifinal já com dois classificados', () => {
  const rounds = bracket(['s1', 's2', 's3', 's4', 's5']);
  assert.equal(rounds[0].filter((m) => m.bye).length, 3);
  assert.deepEqual(rounds[0].filter((m) => !m.bye).map((m) => [m.a, m.b]), [['s4', 's5']]);
  assert.deepEqual(rounds[1].map((m) => [m.a, m.b]), [['s1', null], ['s2', 's3']]);
  assert.deepEqual(rounds.map((r) => r[0].name), ['Quartas de final', 'Semifinal', 'Final']);
});

test('cruzamento dos grupos: 1º do A pega o 2º do B', () => {
  const rounds = bracket(['A1', 'B1', 'A2', 'B2']);
  assert.deepEqual(rounds[0].map((m) => [m.a, m.b]), [['A1', 'B2'], ['B1', 'A2']]);
});

test('nomes das fases do mata-mata', () => {
  assert.equal(knockoutRoundName(8, 1), 'Oitavas de final');
  assert.equal(knockoutRoundName(16, 1), 'Fase 1');
});

const plan = (overrides) => scheduleRounds({
  matchesPerRound: [2, 2], firstDate: '2026-12-01', firstTime: 18 * 60, duration: 60, intervalDays: 7,
  endDate: '2026-12-31', addDays: addDaysIso, ...overrides,
});

test('agenda: rodadas a cada intervalo, jogos em sequência', () => {
  assert.deepEqual(plan().schedule, [
    { date: '2026-12-01', times: [1080, 1140] },
    { date: '2026-12-08', times: [1080, 1140] },
  ]);
});

test('agenda: rodada que não cabe no dia ou depois do fim do campeonato', () => {
  assert.equal(plan({ firstTime: 23 * 60 }).error, 'dayFull');
  assert.equal(plan({ endDate: '2026-12-05' }).error, 'afterEnd');
});
