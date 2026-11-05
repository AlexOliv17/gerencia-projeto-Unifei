const { OPEN_REGISTRATION_STATUSES } = require('../constants');
const { displayStatus } = require('./championships');

const OPEN = OPEN_REGISTRATION_STATUSES.map((s) => `'${s}'`).join(', ');

const SELECT = `SELECT r.*, c.name AS championship_name, c.status AS championship_status, c.sport AS championship_sport,
    c.registration_deadline, c.organizer_id, cc.name AS category_name,
    teams.name AS team_name, teams.deleted_at AS team_deleted_at,
    users.name AS user_name, users.email AS user_email, users.deleted_at AS user_deleted_at
  FROM registrations r
  JOIN championships c ON c.id = r.championship_id
  JOIN championship_categories cc ON cc.id = r.category_id
  JOIN users ON users.id = r.user_id
  LEFT JOIN teams ON teams.id = r.team_id`;

/** Team name, "Equipe removida" for a deleted team, or the athlete's name for an individual registration. */
function entryName(row) {
  if (row.team_id) return row.team_deleted_at ? 'Equipe removida' : row.team_name;
  return row.user_name;
}

function decorate(row) {
  return {
    ...row,
    entryName: entryName(row),
    championshipDisplayStatus: displayStatus({ status: row.championship_status, registration_deadline: row.registration_deadline }),
  };
}

function createRegistration(db, { championshipId, categoryId, teamId, userId, status }) {
  const now = new Date().toISOString();
  return Number(db.prepare(`INSERT INTO registrations
    (championship_id, category_id, team_id, user_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(championshipId, categoryId, teamId ?? null, userId, status, now, now).lastInsertRowid);
}

function getRegistration(db, id) {
  const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(id);
  return row ? decorate(row) : undefined;
}

/** "Minhas inscrições": everything the person requested, newest first. */
function listRegistrationsByUser(db, userId) {
  return db.prepare(`${SELECT} WHERE r.user_id = ? ORDER BY r.created_at DESC, r.id DESC`).all(userId).map(decorate);
}

function approvedCount(db, categoryId) {
  return db.prepare("SELECT COUNT(*) AS n FROM registrations WHERE category_id = ? AND status = 'approved'")
    .get(categoryId).n;
}

/** A team (or, for individual registrations, a person) already holding or waiting for a place in the category. */
function hasOpenRegistration(db, { categoryId, teamId, userId }) {
  const row = teamId
    ? db.prepare(`SELECT 1 FROM registrations WHERE category_id = ? AND team_id = ? AND status IN (${OPEN})`)
      .get(categoryId, teamId)
    : db.prepare(`SELECT 1 FROM registrations WHERE category_id = ? AND team_id IS NULL AND user_id = ?
      AND status IN (${OPEN})`).get(categoryId, userId);
  return Boolean(row);
}

function setStatus(db, id, status, { reason = null, decided = false } = {}) {
  const now = new Date().toISOString();
  db.prepare(`UPDATE registrations SET status = ?, refuse_reason = ?, decided_at = COALESCE(?, decided_at), updated_at = ?
    WHERE id = ?`).run(status, reason, decided ? now : null, now, id);
}

function cancelRegistration(db, id) {
  setStatus(db, id, 'cancelled');
}

/** Public detail: approved entries per category, with the occupied places. */
function approvedEntriesByCategory(db, championshipId) {
  const categories = db.prepare('SELECT id, name FROM championship_categories WHERE championship_id = ? ORDER BY id')
    .all(championshipId);
  const approved = db.prepare(`${SELECT} WHERE r.championship_id = ? AND r.status = 'approved' ORDER BY r.decided_at, r.id`)
    .all(championshipId).map(decorate);
  return categories.map((c) => {
    const entries = approved.filter((r) => r.category_id === c.id).map((r) => r.entryName);
    return { id: c.id, category: c.name, approved: entries.length, entries };
  });
}

module.exports = {
  entryName, createRegistration, getRegistration, listRegistrationsByUser, approvedCount, hasOpenRegistration,
  setStatus, cancelRegistration, approvedEntriesByCategory,
};
