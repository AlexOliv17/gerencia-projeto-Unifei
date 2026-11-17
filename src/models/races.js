const { formatTime } = require('../validation/dates');

/** Every category of a street run with its start, if any (RFS09 rule 4). */
function listRaceStarts(db, championshipId) {
  return db.prepare(`SELECT cc.id AS category_id, cc.name AS category_name, rs.id, rs.start_date, rs.start_time, rs.venue, rs.status
    FROM championship_categories cc LEFT JOIN race_starts rs ON rs.category_id = cc.id
    WHERE cc.championship_id = ? ORDER BY cc.id`).all(championshipId);
}

function getRaceStart(db, categoryId) {
  return db.prepare('SELECT * FROM race_starts WHERE category_id = ?').get(categoryId);
}

/** Creates the category's start or reschedules it (a cancelled start comes back as scheduled). */
function saveRaceStart(db, championshipId, categoryId, { date, startTime, venue }) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO race_starts (championship_id, category_id, start_date, start_time, venue, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?)
    ON CONFLICT (category_id) DO UPDATE SET start_date = excluded.start_date, start_time = excluded.start_time,
      venue = excluded.venue, status = 'scheduled', updated_at = excluded.updated_at`)
    .run(championshipId, categoryId, date, formatTime(startTime), venue, now, now);
}

function cancelRaceStart(db, categoryId) {
  db.prepare("UPDATE race_starts SET status = 'cancelled', updated_at = ? WHERE category_id = ?").run(new Date().toISOString(), categoryId);
}

/** Approved runners of a category with their finish time in seconds (null when not recorded yet). */
function listRunners(db, categoryId) {
  return db.prepare(`SELECT r.id, users.name, users.deleted_at, rr.finish_seconds AS seconds, rr.updated_at
    FROM registrations r JOIN users ON users.id = r.user_id LEFT JOIN race_results rr ON rr.registration_id = r.id
    WHERE r.category_id = ? AND r.status = 'approved' AND r.team_id IS NULL ORDER BY users.name`).all(categoryId);
}

module.exports = {
  listRaceStarts, getRaceStart, saveRaceStart, cancelRaceStart, listRunners,
};
