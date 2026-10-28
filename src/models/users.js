const bcrypt = require('bcryptjs');

const BCRYPT_COST = 10;

function createUser(db, { name, email, password, cityId, role, status, document = null, leagueName = null }) {
  const now = new Date().toISOString();
  return Number(db.prepare(`INSERT INTO users
    (name, email, password_hash, city_id, role, status, document, league_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, email, bcrypt.hashSync(password, BCRYPT_COST), cityId, role, status, document, leagueName, now, now)
    .lastInsertRowid);
}

/** Active (not deleted) user by e-mail; the e-mail must already be normalized. */
function findUserByEmail(db, email) {
  return db.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').get(email);
}

function findUserById(db, id) {
  return db.prepare(`SELECT users.*, cities.name AS city_name
    FROM users JOIN cities ON cities.id = users.city_id
    WHERE users.id = ? AND users.deleted_at IS NULL`).get(id);
}

function emailInUse(db, email, exceptId = null) {
  return Boolean(db.prepare('SELECT 1 FROM users WHERE email = ? AND id IS NOT ?').get(email, exceptId));
}

module.exports = { createUser, findUserByEmail, findUserById, emailInUse, BCRYPT_COST };
