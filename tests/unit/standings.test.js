const test = require('node:test');
const assert = require('node:assert/strict');
const { computeStandings, raceRanking } = require('../../src/rules/standings');

const POINTS = { win: 3, draw: 1, loss: 0 };
const entries = (...names) => names.map((name, i) => ({ id: i + 1, name }));
const game = (a, b, scoreA, scoreB, pointsA = null, pointsB = null) => ({ a, b, scoreA, scoreB, pointsA, pointsB });

test('futebol: vitória 3, empate 1, derrota 0, com gols e saldo', () => {
  const table = computeStandings({
    sport: 'futsal', points: POINTS, entries: entries('Alfa', 'Beta', 'Gama'),
    matches: [game(1, 2, 2, 1), game(2, 3, 0, 0)],
  });
  assert.deepEqual(table.map((r) => [r.position, r.name, r.points, r.played, r.wins, r.draws, r.losses, r.for, r.against, r.diff]), [
    [1, 'Alfa', 3, 1, 1, 0, 0, 2, 1, 1],
    [2, 'Gama', 1, 1, 0, 1, 0, 0, 0, 0],
    [3, 'Beta', 1, 2, 0, 1, 1, 1, 2, -1],
  ]);
});

test('equipe sem jogos aparece zerada', () => {
  const table = computeStandings({ sport: 'football', points: POINTS, entries: entries('Alfa', 'Beta'), matches: [] });
  assert.deepEqual(table.map((r) => [r.name, r.points, r.played]), [['Alfa', 0, 0], ['Beta', 0, 0]]);
});

test('desempate do futebol: vitórias, depois saldo, depois gols marcados', () => {
  // Alfa e Beta: 1 vitória e 1 empate cada; o saldo decide.
  const bySaldo = computeStandings({
    sport: 'football', points: POINTS, entries: entries('Alfa', 'Beta', 'Gama', 'Delta'),
    matches: [game(1, 3, 1, 0), game(1, 2, 1, 1), game(2, 4, 3, 0)],
  });
  assert.deepEqual(bySaldo.slice(0, 2).map((r) => r.name), ['Beta', 'Alfa']);

  const byGoals = computeStandings({
    sport: 'football', points: POINTS, entries: entries('Alfa', 'Beta', 'Gama', 'Delta'),
    matches: [game(1, 3, 3, 2), game(2, 4, 1, 0)],
  });
  assert.deepEqual(byGoals.slice(0, 2).map((r) => r.name), ['Alfa', 'Beta']);
});

test('desempate por vitórias vem antes do saldo (pontuação configurada)', () => {
  // Vitória valendo 2: Alfa (1V 1D) e Beta (2E) somam 2 pontos; Alfa passa por ter mais vitórias.
  const table = computeStandings({
    sport: 'football', points: { win: 2, draw: 1, loss: 0 }, entries: entries('Alfa', 'Beta', 'Gama', 'Delta'),
    matches: [game(1, 3, 1, 0), game(1, 4, 0, 5), game(2, 3, 0, 0), game(2, 4, 0, 0)],
  });
  assert.equal(table.find((r) => r.name === 'Alfa').points, 2);
  assert.equal(table.find((r) => r.name === 'Beta').points, 2);
  assert.ok(table.findIndex((r) => r.name === 'Alfa') < table.findIndex((r) => r.name === 'Beta'));
});

test('empate em todos os critérios: ordem alfabética', () => {
  const table = computeStandings({ sport: 'futsal', points: POINTS, entries: entries('Zeta', 'Ômega', 'Alfa'), matches: [] });
  assert.deepEqual(table.map((r) => r.name), ['Alfa', 'Ômega', 'Zeta']);
});

test('vôlei: sets como placar, desempate por saldo de sets e depois saldo de pontos', () => {
  const table = computeStandings({
    sport: 'volleyball', points: POINTS, entries: entries('Estrelas', 'Ases', 'Garças'),
    matches: [game(1, 2, 3, 1, 98, 80), game(2, 3, 3, 2, 110, 104)],
  });
  assert.deepEqual(table.map((r) => [r.name, r.points, r.diff, r.pointsDiff]), [
    ['Estrelas', 3, 2, 18], ['Ases', 3, -1, -12], ['Garças', 0, -1, -6],
  ]);

  const byPoints = computeStandings({
    sport: 'volleyball', points: POINTS, entries: entries('Alfa', 'Beta', 'Gama', 'Delta'),
    matches: [game(1, 3, 3, 0, 75, 60), game(2, 4, 3, 0, 75, 70)],
  });
  assert.deepEqual(byPoints.slice(0, 2).map((r) => r.name), ['Alfa', 'Beta']);
});

test('corrida: menor tempo primeiro, sem tempo no fim', () => {
  const ranking = raceRanking([
    { id: 1, name: 'Caio', seconds: null }, { id: 2, name: 'Bia', seconds: 1500 }, { id: 3, name: 'Ana', seconds: 1400 },
    { id: 4, name: 'Abel', seconds: null },
  ]);
  assert.deepEqual(ranking.map((r) => [r.position, r.name]), [[1, 'Ana'], [2, 'Bia'], [null, 'Abel'], [null, 'Caio']]);
});
