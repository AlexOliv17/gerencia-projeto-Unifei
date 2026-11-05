const { OPEN_REGISTRATION_STATUSES } = require('../constants');

const OPEN = OPEN_REGISTRATION_STATUSES.map((s) => `'${s}'`).join(', ');

function insertAthletes(db, teamId, athletes) {
  const insert = db.prepare('INSERT INTO team_athletes (team_id, name, number, position) VALUES (?, ?, ?, ?)');
  athletes.forEach((a, i) => insert.run(teamId, a.name, a.number, i + 1));
}

function createTeam(db, ownerId, data) {
  const now = new Date().toISOString();
  return db.transaction(() => {
    const id = Number(db.prepare(`INSERT INTO teams (owner_id, name, sport, city_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(ownerId, data.name, data.sport, data.cityId, now, now).lastInsertRowid);
    insertAthletes(db, id, data.athletes);
    return id;
  })();
}

/** Team that was not deleted, with its city, owner and athletes in the order they were typed. */
function getTeam(db, id) {
  const team = db.prepare(`SELECT teams.*, cities.name AS city_name, users.name AS owner_name
    FROM teams JOIN cities ON cities.id = teams.city_id JOIN users ON users.id = teams.owner_id
    WHERE teams.id = ? AND teams.deleted_at IS NULL`).get(id);
  if (!team) return undefined;
  team.athletes = db.prepare('SELECT name, number FROM team_athletes WHERE team_id = ? ORDER BY position').all(id);
  return team;
}

function listTeamsByOwner(db, ownerId) {
  return db.prepare(`SELECT teams.*, cities.name AS city_name,
      (SELECT COUNT(*) FROM team_athletes WHERE team_athletes.team_id = teams.id) AS athlete_count
    FROM teams JOIN cities ON cities.id = teams.city_id
    WHERE teams.owner_id = ? AND teams.deleted_at IS NULL ORDER BY teams.name COLLATE NOCASE`).all(ownerId);
}

function listTeamsForSport(db, ownerId, sport) {
  return listTeamsByOwner(db, ownerId).filter((t) => t.sport === sport);
}

/** SQLite's lower() only folds ASCII, so the comparison is done in JS to cover accented names too. */
function teamNameInUse(db, ownerId, name, exceptId = null) {
  const key = name.toLocaleLowerCase('pt-BR');
  return db.prepare('SELECT id, name FROM teams WHERE owner_id = ? AND deleted_at IS NULL').all(ownerId)
    .some((t) => t.id !== exceptId && t.name.toLocaleLowerCase('pt-BR') === key);
}

function updateTeam(db, id, data) {
  db.transaction(() => {
    db.prepare('UPDATE teams SET name = ?, sport = ?, city_id = ?, updated_at = ? WHERE id = ?')
      .run(data.name, data.sport, data.cityId, new Date().toISOString(), id);
    db.prepare('DELETE FROM team_athletes WHERE team_id = ?').run(id);
    insertAthletes(db, id, data.athletes);
  })();
}

/** Pending, approved or waitlisted registrations in championships that are still active. */
function hasOpenRegistrations(db, teamId) {
  return Boolean(db.prepare(`SELECT 1 FROM registrations r JOIN championships c ON c.id = r.championship_id
    WHERE r.team_id = ? AND c.status = 'active' AND r.status IN (${OPEN})`).get(teamId));
}

function hasApprovedInActiveChampionship(db, teamId) {
  return Boolean(db.prepare(`SELECT 1 FROM registrations r JOIN championships c ON c.id = r.championship_id
    WHERE r.team_id = ? AND c.status = 'active' AND r.status = 'approved'`).get(teamId));
}

/** Open registrations in active championships are cancelled; athletes (personal data) are erased. */
function deleteTeam(db, id) {
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`UPDATE registrations SET status = 'cancelled', updated_at = ?
      WHERE team_id = ? AND status IN (${OPEN})
        AND championship_id IN (SELECT id FROM championships WHERE status = 'active')`).run(now, id);
    db.prepare('DELETE FROM team_athletes WHERE team_id = ?').run(id);
    db.prepare('UPDATE teams SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
  })();
}

/**
 * Account deletion (LGPD): every team of the person is deleted as above, without the approved-registration
 * block, and their own individual registrations still open in active championships are cancelled.
 */
function closeAccountTeams(db, userId) {
  db.transaction(() => {
    for (const { id } of db.prepare('SELECT id FROM teams WHERE owner_id = ? AND deleted_at IS NULL').all(userId)) {
      deleteTeam(db, id);
    }
    db.prepare(`UPDATE registrations SET status = 'cancelled', updated_at = ?
      WHERE user_id = ? AND team_id IS NULL AND status IN (${OPEN})
        AND championship_id IN (SELECT id FROM championships WHERE status = 'active')`).run(new Date().toISOString(), userId);
  })();
}

/** The athlete list is personal data: only the owner and organizers the team applied to can see it. */
function canViewTeam(db, user, team) {
  if (!user) return false;
  if (team.owner_id === user.id) return true;
  // Same rule as managing championships (Mantis #3): a pending organizer has no organizer rights.
  if (user.role !== 'organizer' || user.status !== 'active') return false;
  return Boolean(db.prepare(`SELECT 1 FROM registrations r JOIN championships c ON c.id = r.championship_id
    WHERE r.team_id = ? AND c.organizer_id = ?`).get(team.id, user.id));
}

/** Registrations of the team, newest first, for its detail page. */
function registrationsOfTeam(db, teamId) {
  return db.prepare(`SELECT r.*, c.name AS championship_name, cc.name AS category_name
    FROM registrations r JOIN championships c ON c.id = r.championship_id
    JOIN championship_categories cc ON cc.id = r.category_id
    WHERE r.team_id = ? ORDER BY r.created_at DESC, r.id DESC`).all(teamId);
}

module.exports = {
  createTeam, getTeam, listTeamsByOwner, listTeamsForSport, teamNameInUse, updateTeam, hasOpenRegistrations,
  hasApprovedInActiveChampionship, deleteTeam, closeAccountTeams, canViewTeam, registrationsOfTeam,
};
