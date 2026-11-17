const { OPEN_REGISTRATION_STATUSES } = require('../constants');
const { championshipFollowers, teamFollowers } = require('./follows');

const OPEN = OPEN_REGISTRATION_STATUSES.map((s) => `'${s}'`).join(', ');

/** Tabela 09 "interessados" in a championship: its followers and whoever holds an open registration in it. */
function championshipAudience(db, championshipId) {
  const registered = db.prepare(`SELECT DISTINCT user_id FROM registrations WHERE championship_id = ? AND status IN (${OPEN})`)
    .all(championshipId).map((r) => r.user_id);
  return [...championshipFollowers(db, championshipId), ...registered];
}

/** A game: the people responsible for both entries, the followers of both teams and of the championship. */
function matchAudience(db, match) {
  const entries = db.prepare('SELECT user_id, team_id FROM registrations WHERE id IN (?, ?)')
    .all(match.registration_a_id ?? 0, match.registration_b_id ?? 0);
  return [
    ...entries.map((e) => e.user_id),
    ...teamFollowers(db, entries.map((e) => e.team_id)),
    ...championshipFollowers(db, match.championship_id),
  ];
}

/** A street run start: the approved runners of the category and the championship's followers. */
function raceAudience(db, championshipId, categoryId) {
  const runners = db.prepare("SELECT user_id FROM registrations WHERE category_id = ? AND status = 'approved'")
    .all(categoryId).map((r) => r.user_id);
  return [...runners, ...championshipFollowers(db, championshipId)];
}

module.exports = { championshipAudience, matchAudience, raceAudience };
