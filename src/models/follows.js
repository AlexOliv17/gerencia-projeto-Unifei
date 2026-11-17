/** RFS17: what a person follows. A follow points to a championship or to a team, never both. */
function isFollowing(db, userId, { championshipId = null, teamId = null }) {
  const column = championshipId ? 'championship_id' : 'team_id';
  return Boolean(db.prepare(`SELECT 1 FROM follows WHERE user_id = ? AND ${column} = ?`).get(userId, championshipId ?? teamId));
}

function follow(db, userId, { championshipId = null, teamId = null }) {
  db.prepare(`INSERT OR IGNORE INTO follows (user_id, championship_id, team_id, created_at) VALUES (?, ?, ?, ?)`)
    .run(userId, championshipId, teamId, new Date().toISOString());
}

function unfollow(db, userId, { championshipId = null, teamId = null }) {
  const column = championshipId ? 'championship_id' : 'team_id';
  db.prepare(`DELETE FROM follows WHERE user_id = ? AND ${column} = ?`).run(userId, championshipId ?? teamId);
}

/** Ids the person follows, to mark the buttons of a page in one query. */
function followedIds(db, userId) {
  const rows = db.prepare('SELECT championship_id, team_id FROM follows WHERE user_id = ?').all(userId ?? 0);
  return {
    championships: new Set(rows.filter((r) => r.championship_id).map((r) => r.championship_id)),
    teams: new Set(rows.filter((r) => r.team_id).map((r) => r.team_id)),
  };
}

function followedChampionshipIds(db, userId) {
  return db.prepare(`SELECT f.championship_id AS id FROM follows f JOIN championships c ON c.id = f.championship_id
    WHERE f.user_id = ? ORDER BY c.start_date, c.name`).all(userId).map((r) => r.id);
}

function followedTeams(db, userId) {
  return db.prepare(`SELECT t.id, t.name, t.sport, cities.name AS city_name FROM follows f
    JOIN teams t ON t.id = f.team_id JOIN cities ON cities.id = t.city_id
    WHERE f.user_id = ? AND t.deleted_at IS NULL ORDER BY t.name`).all(userId);
}

/** Who follows a championship, or any of the teams. */
function championshipFollowers(db, championshipId) {
  return db.prepare('SELECT user_id FROM follows WHERE championship_id = ?').all(championshipId).map((r) => r.user_id);
}

function teamFollowers(db, teamIds) {
  const ids = teamIds.filter(Boolean);
  if (!ids.length) return [];
  return db.prepare(`SELECT user_id FROM follows WHERE team_id IN (${ids.map(() => '?').join(', ')})`).all(...ids)
    .map((r) => r.user_id);
}

module.exports = {
  isFollowing, follow, unfollow, followedIds, followedChampionshipIds, followedTeams, championshipFollowers, teamFollowers,
};
