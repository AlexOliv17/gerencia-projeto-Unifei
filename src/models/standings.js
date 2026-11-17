const { computeStandings } = require('../rules/standings');
const { approvedEntries, listMatches } = require('./matches');

const pointsOf = (championship) => ({
  win: championship.points_win, draw: championship.points_draw, loss: championship.points_loss,
});

/**
 * Standings of one category, computed now from the results (RNF04). Round robin → one table with every approved
 * entry; groups → one table per group with the entries that play in it; plain knockout → no table.
 */
function categoryStandings(db, championship, categoryId) {
  if (championship.format === 'knockout' || championship.sport === 'street_run') return [];
  const entries = approvedEntries(db, championship.id).get(categoryId) ?? [];
  const league = listMatches(db, championship.id, { categoryId }).filter((m) => m.kind === 'league' && m.status === 'scheduled');
  const played = (list) => list.filter((m) => m.hasResult).map((m) => ({
    a: m.registration_a_id, b: m.registration_b_id, scoreA: m.score_a, scoreB: m.score_b, pointsA: m.points_a, pointsB: m.points_b,
  }));
  if (championship.format === 'round_robin') {
    return [{ group: null, rows: computeStandings({ sport: championship.sport, points: pointsOf(championship), entries, matches: played(league) }) }];
  }
  const groups = [...new Set(league.map((m) => m.group_name).filter(Boolean))].sort();
  return groups.map((group) => {
    const games = league.filter((m) => m.group_name === group);
    const ids = new Set(games.flatMap((m) => [m.registration_a_id, m.registration_b_id]));
    return {
      group,
      rows: computeStandings({
        sport: championship.sport, points: pointsOf(championship), entries: entries.filter((e) => ids.has(e.id)), matches: played(games),
      }),
    };
  });
}

module.exports = { categoryStandings };
