const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');

/**
 * RFS11 / Tabela 06. Always computed from the results (RNF04): `matches` are the league games of one table that
 * have a result and were not cancelled, with entry ids `a` and `b`. Volleyball scores are sets and `pointsA/B` the
 * optional point totals; there is no draw in volleyball.
 */
function computeStandings({ sport, points, entries, matches }) {
  const rows = new Map(entries.map((e) => [e.id, {
    id: e.id, name: e.name, played: 0, wins: 0, draws: 0, losses: 0, for: 0, against: 0, pointsFor: 0, pointsAgainst: 0,
  }]));
  for (const m of matches) {
    const a = rows.get(m.a);
    const b = rows.get(m.b);
    if (!a || !b) continue;
    for (const [row, mine, theirs, minePts, theirPts] of [
      [a, m.scoreA, m.scoreB, m.pointsA, m.pointsB], [b, m.scoreB, m.scoreA, m.pointsB, m.pointsA]]) {
      row.played += 1;
      row.for += mine;
      row.against += theirs;
      row.pointsFor += minePts ?? 0;
      row.pointsAgainst += theirPts ?? 0;
      if (mine > theirs) row.wins += 1;
      else if (mine < theirs) row.losses += 1;
      else row.draws += 1;
    }
  }
  const table = [...rows.values()].map((r) => ({
    ...r,
    diff: r.for - r.against,
    pointsDiff: r.pointsFor - r.pointsAgainst,
    points: r.wins * points.win + r.draws * points.draw + r.losses * points.loss,
  }));
  const volleyball = sport === 'volleyball';
  table.sort((x, y) => y.points - x.points || y.wins - x.wins || y.diff - x.diff
    || (volleyball ? y.pointsDiff - x.pointsDiff : y.for - x.for) || byName(x, y));
  return table.map((row, i) => ({ ...row, position: i + 1 }));
}

/** Street run: fastest first; runners without a time come last, by name. */
function raceRanking(entries) {
  const timed = entries.filter((e) => e.seconds != null).sort((x, y) => x.seconds - y.seconds || byName(x, y));
  const untimed = entries.filter((e) => e.seconds == null).sort(byName);
  return [...timed.map((e, i) => ({ ...e, position: i + 1 })), ...untimed.map((e) => ({ ...e, position: null }))];
}

module.exports = { computeStandings, raceRanking };
