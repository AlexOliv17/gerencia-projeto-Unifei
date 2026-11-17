const { entryName } = require('./registrations');
const { formatBrDate, formatTime } = require('../validation/dates');

const SELECT = `SELECT m.*, cc.name AS category_name, c.name AS championship_name,
    ta.name AS team_a_name, ta.deleted_at AS team_a_deleted_at, ua.name AS user_a_name, ra.team_id AS team_a_id,
    tb.name AS team_b_name, tb.deleted_at AS team_b_deleted_at, ub.name AS user_b_name, rb.team_id AS team_b_id,
    editor.name AS result_updated_by_name
  FROM matches m
  JOIN championship_categories cc ON cc.id = m.category_id
  JOIN championships c ON c.id = m.championship_id
  LEFT JOIN registrations ra ON ra.id = m.registration_a_id
  LEFT JOIN teams ta ON ta.id = ra.team_id
  LEFT JOIN users ua ON ua.id = ra.user_id
  LEFT JOIN registrations rb ON rb.id = m.registration_b_id
  LEFT JOIN teams tb ON tb.id = rb.team_id
  LEFT JOIN users ub ON ub.id = rb.user_id
  LEFT JOIN users editor ON editor.id = m.result_updated_by`;

const hasResult = (m) => m.score_a !== null && m.score_b !== null;

function side(row, slot) {
  if (!row[`registration_${slot}_id`]) return 'A definir';
  return entryName({
    team_id: row[`team_${slot}_id`], team_name: row[`team_${slot}_name`], team_deleted_at: row[`team_${slot}_deleted_at`],
    user_name: row[`user_${slot}_name`],
  });
}

function decorate(row) {
  return {
    ...row,
    nameA: side(row, 'a'),
    nameB: side(row, 'b'),
    hasResult: hasResult(row),
    displayStatus: row.status === 'cancelled' ? 'cancelled' : (hasResult(row) ? 'finished' : 'scheduled'),
    startLabel: row.start_time,
  };
}

function getMatch(db, id) {
  const row = db.prepare(`${SELECT} WHERE m.id = ?`).get(id);
  return row ? decorate(row) : undefined;
}

/** A championship's table, optionally one category: round order, then date and time. */
function listMatches(db, championshipId, { categoryId } = {}) {
  const where = ['m.championship_id = :championshipId'];
  const params = { championshipId };
  if (categoryId) { where.push('m.category_id = :categoryId'); params.categoryId = categoryId; }
  return db.prepare(`${SELECT} WHERE ${where.join(' AND ')}
    ORDER BY m.round_number, m.group_name, m.match_date, m.start_time, m.id`).all(params).map(decorate);
}

/** Every game a team plays, in any championship (not cancelled), by date: RFS17 personal area. */
function teamMatches(db, teamId) {
  return db.prepare(`${SELECT} WHERE m.status = 'scheduled' AND (ra.team_id = :team OR rb.team_id = :team)
    ORDER BY m.match_date, m.start_time`).all({ team: teamId }).map(decorate);
}

/** Approved entries of each category of the championship (RFS09 rule 3), by name. */
function approvedEntries(db, championshipId) {
  const rows = db.prepare(`SELECT r.id, r.category_id, r.team_id, teams.name AS team_name, teams.deleted_at AS team_deleted_at,
      users.name AS user_name
    FROM registrations r JOIN users ON users.id = r.user_id LEFT JOIN teams ON teams.id = r.team_id
    WHERE r.championship_id = ? AND r.status = 'approved'`).all(championshipId);
  const byCategory = new Map();
  for (const row of rows) {
    const list = byCategory.get(row.category_id) ?? [];
    list.push({ id: row.id, name: entryName(row), teamId: row.team_id });
    byCategory.set(row.category_id, list);
  }
  for (const list of byCategory.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return byCategory;
}

const overlaps = (startA, durA, startB, durB) => startA < startB + durB && startB < startA + durA;

/**
 * RFS09 rules 1 and 2 for a game on `date` at `startTime` (minutes) lasting `duration`: the same team may not have an
 * overlapping scheduled game in any championship, and the venue may not host two overlapping games of this
 * championship. Returns the error message or null. `ignoreId` skips the game being rescheduled.
 */
function findConflict(db, { championshipId, date, startTime, duration, venue, teamIds, ignoreId = 0, names }) {
  const sameDay = db.prepare(`SELECT m.id, m.championship_id, m.start_time, m.duration_minutes, m.venue,
      ra.team_id AS team_a, rb.team_id AS team_b
    FROM matches m
    LEFT JOIN registrations ra ON ra.id = m.registration_a_id
    LEFT JOIN registrations rb ON rb.id = m.registration_b_id
    WHERE m.match_date = ? AND m.status = 'scheduled' AND m.id <> ?`).all(date, ignoreId);
  const place = venue.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const other of sameDay) {
    const [h, min] = other.start_time.split(':').map(Number);
    if (!overlaps(startTime, duration, h * 60 + min, other.duration_minutes)) continue;
    const busy = teamIds.find((id) => id && (id === other.team_a || id === other.team_b));
    if (busy) return { field: 'team', team: names.get(busy), date: formatBrDate(date), time: other.start_time };
    if (other.championship_id === championshipId && other.venue.trim().toLowerCase().replace(/\s+/g, ' ') === place) {
      return { field: 'venue', date: formatBrDate(date), time: other.start_time };
    }
  }
  return null;
}

function insertMatch(db, championshipId, data) {
  const now = new Date().toISOString();
  return Number(db.prepare(`INSERT INTO matches
    (championship_id, category_id, kind, round, round_number, group_name, registration_a_id, registration_b_id, match_date,
     start_time, duration_minutes, venue, next_match_id, next_slot, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    championshipId, data.categoryId, data.kind, data.round, data.roundNumber ?? 1, data.groupName ?? null,
    data.registrationAId ?? null, data.registrationBId ?? null, data.date, formatTime(data.startTime), data.duration,
    data.venue, data.nextMatchId ?? null, data.nextSlot ?? null, now, now,
  ).lastInsertRowid);
}

function updateMatch(db, id, data) {
  db.prepare(`UPDATE matches SET category_id = ?, kind = ?, round = ?, group_name = ?, registration_a_id = ?,
    registration_b_id = ?, match_date = ?, start_time = ?, duration_minutes = ?, venue = ?, updated_at = ? WHERE id = ?`).run(
    data.categoryId, data.kind, data.round, data.groupName, data.registrationAId, data.registrationBId, data.date,
    formatTime(data.startTime), data.duration, data.venue, new Date().toISOString(), id,
  );
}

function cancelMatch(db, id) {
  db.prepare("UPDATE matches SET status = 'cancelled', updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

/** Games of the category that still count (not cancelled). */
function activeMatchCount(db, categoryId, { kind } = {}) {
  return db.prepare(`SELECT COUNT(*) AS n FROM matches WHERE category_id = ? AND status = 'scheduled'
    ${kind ? 'AND kind = ?' : ''}`).get(...(kind ? [categoryId, kind] : [categoryId])).n;
}

/** A bracket game whose teams come from earlier games (their winners fill its slots). */
function isFedByBracket(db, matchId) {
  return Boolean(db.prepare('SELECT 1 FROM matches WHERE next_match_id = ?').get(matchId));
}

/** Whether the championship has any game that still counts; its format is frozen from then on. */
function championshipHasGames(db, championshipId) {
  return Boolean(db.prepare("SELECT 1 FROM matches WHERE championship_id = ? AND status = 'scheduled'").get(championshipId));
}

/** Last result change of the championship (or one category): RFS13 "data e hora da última atualização". */
function lastResultUpdate(db, championshipId, categoryId = null) {
  const matches = db.prepare(`SELECT MAX(result_updated_at) AS at FROM matches WHERE championship_id = ?
    ${categoryId ? 'AND category_id = ?' : ''}`).get(...(categoryId ? [championshipId, categoryId] : [championshipId])).at;
  const races = db.prepare(`SELECT MAX(rr.updated_at) AS at FROM race_results rr JOIN registrations r ON r.id = rr.registration_id
    WHERE r.championship_id = ? ${categoryId ? 'AND r.category_id = ?' : ''}`)
    .get(...(categoryId ? [championshipId, categoryId] : [championshipId])).at;
  return [matches, races].filter(Boolean).sort().pop() ?? null;
}

module.exports = {
  getMatch, listMatches, teamMatches, approvedEntries, findConflict, insertMatch, updateMatch, cancelMatch, activeMatchCount,
  lastResultUpdate, hasResult, overlaps, championshipHasGames, isFedByBracket,
};
