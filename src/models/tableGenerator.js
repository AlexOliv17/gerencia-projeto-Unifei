const { MESSAGES } = require('../constants');
const {
  roundRobinRounds, splitGroups, bracket, scheduleRounds,
} = require('../rules/schedule');
const { addDaysIso } = require('../validation/dates');
const {
  approvedEntries, activeMatchCount, findConflict, insertMatch, listMatches,
} = require('./matches');
const { categoryStandings } = require('./standings');

/** Thrown inside the transaction so a conflict found halfway rolls back the games already inserted. */
class GenerationError extends Error {}

function conflictMessage(conflict) {
  return conflict.field === 'team'
    ? MESSAGES.matchTeamBusy(conflict.team, conflict.date, conflict.time)
    : MESSAGES.matchVenueBusy(conflict.date, conflict.time);
}

/** Inserts one planned game after checking rules 1 and 2 against what is already in the database. */
function place(db, championship, game, names) {
  const conflict = findConflict(db, {
    championshipId: championship.id, date: game.date, startTime: game.startTime, duration: game.duration, venue: game.venue,
    teamIds: [game.entryA?.teamId, game.entryB?.teamId], names,
  });
  if (conflict) throw new GenerationError(conflictMessage(conflict));
  return insertMatch(db, championship.id, {
    ...game, registrationAId: game.entryA?.id ?? null, registrationBId: game.entryB?.id ?? null,
  });
}

function scheduleOrError(championship, data, matchesPerRound) {
  const { schedule, error } = scheduleRounds({
    matchesPerRound, firstDate: data.firstDate, firstTime: data.firstTime, duration: data.duration,
    intervalDays: data.intervalDays, endDate: championship.end_date, addDays: addDaysIso,
  });
  if (error) throw new GenerationError(error === 'dayFull' ? MESSAGES.generateDayFull : MESSAGES.generateAfterEnd);
  return schedule;
}

const teamNames = (entries) => new Map(entries.filter((e) => e.teamId).map((e) => [e.teamId, e.name]));

/** League rounds (round robin, or every group's round r played on the same date). Returns how many games were created. */
function placeLeague(db, championship, data, rounds, names) {
  const schedule = scheduleOrError(championship, data, rounds.map((r) => r.length));
  let created = 0;
  rounds.forEach((pairs, r) => {
    pairs.forEach((pair, i) => {
      place(db, championship, {
        categoryId: data.categoryId, kind: 'league', round: `Rodada ${r + 1}`, roundNumber: r + 1, groupName: pair.group ?? null,
        entryA: pair.a, entryB: pair.b, date: schedule[r].date, startTime: schedule[r].times[i], duration: data.duration,
        venue: data.venue,
      }, names);
      created += 1;
    });
  });
  return created;
}

/**
 * Whole bracket, last round first so each game knows the id of the game its winner goes to. Rounds are numbered
 * after `firstRoundNumber - 1` (the group rounds, if any).
 */
function placeBracket(db, championship, data, seeds, names, firstRoundNumber = 1) {
  const rounds = bracket(seeds);
  const schedule = scheduleOrError(championship, data, rounds.map((r) => r.filter((m) => !m.bye).length));
  const ids = rounds.map(() => []);
  let created = 0;
  for (let k = rounds.length - 1; k >= 0; k -= 1) {
    let slot = 0;
    rounds[k].forEach((match, j) => {
      if (match.bye) return;
      ids[k][j] = place(db, championship, {
        categoryId: data.categoryId, kind: 'knockout', round: match.name, roundNumber: firstRoundNumber + k,
        entryA: match.a, entryB: match.b, date: schedule[k].date, startTime: schedule[k].times[slot], duration: data.duration,
        venue: data.venue, nextMatchId: match.next ? ids[match.next.round][match.next.index] : null, nextSlot: match.next?.slot,
      }, names);
      slot += 1;
      created += 1;
    });
  }
  return created;
}

/** RFS09 automatic table for one category. Returns { created } or { error }. */
function generateTable(db, championship, data) {
  const entries = approvedEntries(db, championship.id).get(data.categoryId) ?? [];
  if (entries.length < 2) return { error: MESSAGES.generateNotEnough };
  if (activeMatchCount(db, data.categoryId)) return { error: MESSAGES.generateHasMatches };
  const names = teamNames(entries);
  try {
    const created = db.transaction(() => {
      if (championship.format === 'knockout') return placeBracket(db, championship, data, entries, names);
      if (championship.format === 'round_robin') {
        return placeLeague(db, championship, data, roundRobinRounds(entries).map((pairs) => pairs.map(([a, b]) => ({ a, b }))), names);
      }
      const groupRounds = splitGroups(entries).map((g) => roundRobinRounds(g.entries).map((pairs) => pairs.map(([a, b]) => ({ a, b, group: g.name }))));
      const rounds = Array.from({ length: Math.max(...groupRounds.map((g) => g.length)) }, (_, r) => groupRounds.flatMap((g) => g[r] ?? []));
      return placeLeague(db, championship, data, rounds, names);
    })();
    return { created };
  } catch (err) {
    if (err instanceof GenerationError) return { error: err.message };
    throw err;
  }
}

/** Groups + knockout: whether the group stage is over and the knockout stage can be drawn. */
function knockoutStatus(db, championship, categoryId) {
  if (championship.format !== 'groups_knockout') return { available: false };
  const games = listMatches(db, championship.id, { categoryId }).filter((m) => m.status === 'scheduled');
  const groupGames = games.filter((m) => m.kind === 'league');
  if (!groupGames.length) return { available: false };
  if (games.some((m) => m.kind === 'knockout')) return { available: false, error: MESSAGES.knockoutExists };
  if (groupGames.some((m) => !m.hasResult)) return { available: false, error: MESSAGES.knockoutNotReady };
  return { available: true, lastRound: Math.max(...groupGames.map((m) => m.round_number)) };
}

/** The two best of each group, crossed: A1, B1, C1…, A2, B2, C2… so the bracket pairs 1st of one group with 2nd of another. */
function generateKnockout(db, championship, data) {
  const status = knockoutStatus(db, championship, data.categoryId);
  if (!status.available) return { error: status.error ?? MESSAGES.knockoutNotReady };
  const tables = categoryStandings(db, championship, data.categoryId);
  const entries = approvedEntries(db, championship.id).get(data.categoryId) ?? [];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const seeds = [0, 1].flatMap((pos) => tables.map((t) => t.rows[pos]).filter(Boolean)).map((row) => byId.get(row.id));
  try {
    const created = db.transaction(() => placeBracket(db, championship, data, seeds, teamNames(entries), status.lastRound + 1))();
    return { created };
  } catch (err) {
    if (err instanceof GenerationError) return { error: err.message };
    throw err;
  }
}

module.exports = { generateTable, generateKnockout, knockoutStatus, conflictMessage };
