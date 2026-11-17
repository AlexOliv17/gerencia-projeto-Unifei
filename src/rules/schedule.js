const { MAX_GROUP_SIZE } = require('../constants');

const DAY_MINUTES = 24 * 60;

/**
 * Circle method: every entry meets every other exactly once. Returns one array of [a, b] pairs per round;
 * with an odd number of entries, one entry rests in each round.
 */
function roundRobinRounds(entries) {
  const list = [...entries];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r += 1) {
    const pairs = [];
    for (let i = 0; i < n / 2; i += 1) {
      const a = list[i];
      const b = list[n - 1 - i];
      // Alternating the fixed entry's side keeps it from always being "Equipe A".
      if (a !== null && b !== null) pairs.push(i === 0 && r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

/** Groups of at most MAX_GROUP_SIZE entries (A, B, C…), dealt in order so the groups differ by one entry at most. */
function splitGroups(entries, maxSize = MAX_GROUP_SIZE) {
  const count = Math.ceil(entries.length / maxSize);
  const groups = Array.from({ length: count }, (_, i) => ({ name: String.fromCharCode(65 + i), entries: [] }));
  entries.forEach((entry, i) => groups[i % count].entries.push(entry));
  return groups;
}

/** Seed positions of a bracket of `size` slots, so seeds 1 and 2 can only meet in the final. */
function seedOrder(size) {
  let order = [0, 1];
  while (order.length < size) {
    const length = order.length * 2;
    order = order.flatMap((seed) => [seed, length - 1 - seed]);
  }
  return order;
}

/** Name of a knockout round that has `matches` games: Final, Semifinal, Quartas, Oitavas, else "Fase N". */
function knockoutRoundName(matches, roundNumber) {
  return { 1: 'Final', 2: 'Semifinal', 4: 'Quartas de final', 8: 'Oitavas de final' }[matches] ?? `Fase ${roundNumber}`;
}

/**
 * Whole knockout bracket for the seeds (best first). rounds[k][j] = { a, b, bye, next } where next points to the
 * slot the winner fills ({ round, index, slot }). First-round byes are already resolved: the entry with no opponent
 * sits in its next-round slot and the bye match is flagged so it is not created.
 */
function bracket(seeds) {
  let size = 2;
  while (size < seeds.length) size *= 2;
  const order = seedOrder(size);
  const totalRounds = Math.log2(size);
  const rounds = [];
  for (let k = 0; k < totalRounds; k += 1) {
    const count = size / 2 ** (k + 1);
    rounds.push(Array.from({ length: count }, (_, j) => ({
      a: null,
      b: null,
      bye: false,
      name: knockoutRoundName(count, k + 1),
      next: k + 1 < totalRounds ? { round: k + 1, index: Math.floor(j / 2), slot: j % 2 === 0 ? 'a' : 'b' } : null,
    })));
  }
  rounds[0].forEach((match, j) => {
    match.a = seeds[order[2 * j]] ?? null;
    match.b = seeds[order[2 * j + 1]] ?? null;
    if (match.a === null || match.b === null) {
      match.bye = true;
      const target = rounds[1][match.next.index];
      target[match.next.slot] = match.a ?? match.b;
    }
  });
  return rounds;
}

/**
 * Seeds for the knockout after the groups: group winners first, then the runners-up, rotated until no first-round
 * game puts two teams of the same group together (with 3 groups the plain order would pair C1 with C2).
 * `tables` = [{ group, first, second }].
 */
function crossGroupSeeds(tables) {
  const winners = tables.map((t) => t.first).filter(Boolean);
  const runners = tables.map((t) => t.second).filter(Boolean);
  const groupOf = new Map(tables.flatMap((t) => [[t.first, t.group], [t.second, t.group]]));
  for (let shift = 0; shift < runners.length; shift += 1) {
    const seeds = [...winners, ...runners.slice(shift), ...runners.slice(0, shift)];
    const clash = bracket(seeds)[0].some((m) => !m.bye && groupOf.get(m.a) === groupOf.get(m.b));
    if (!clash) return seeds;
  }
  return [...winners, ...runners];
}

/**
 * Dates and start times for rounds played one after the other at one venue: round r on firstDate + r × interval,
 * its games back to back from firstTime. Returns { schedule } or { error: 'dayFull' | 'afterEnd' }.
 */
function scheduleRounds({ matchesPerRound, firstDate, firstTime, duration, intervalDays, endDate, addDays }) {
  const schedule = [];
  for (const [r, count] of matchesPerRound.entries()) {
    if (firstTime + count * duration > DAY_MINUTES) return { error: 'dayFull' };
    const date = addDays(firstDate, r * intervalDays);
    if (date > endDate) return { error: 'afterEnd' };
    schedule.push({ date, times: Array.from({ length: count }, (_, i) => firstTime + i * duration) });
  }
  return { schedule };
}

module.exports = {
  roundRobinRounds, splitGroups, seedOrder, knockoutRoundName, bracket, crossGroupSeeds, scheduleRounds,
};
