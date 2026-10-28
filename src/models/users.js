const bcrypt = require('bcryptjs');
const { LOCKOUT } = require('../constants');

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

/**
 * Checks e-mail/password. LOCKOUT.maxAttempts consecutive failures lock the account for LOCKOUT.minutes;
 * the suspended status is only revealed to someone who knows the password.
 */
function authenticate(db, email, password, now = new Date()) {
  const user = findUserByEmail(db, email);
  if (!user) return { error: 'invalid' };

  const locked = user.locked_until && new Date(user.locked_until) > now;
  if (locked) return { error: 'locked' };

  if (!bcrypt.compareSync(String(password ?? ''), user.password_hash)) {
    const attempts = (user.locked_until ? 0 : user.failed_login_attempts) + 1;
    if (attempts >= LOCKOUT.maxAttempts) {
      const until = new Date(now.getTime() + LOCKOUT.minutes * 60 * 1000).toISOString();
      db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = ? WHERE id = ?').run(until, user.id);
      return { error: 'locked' };
    }
    db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = NULL WHERE id = ?').run(attempts, user.id);
    return { error: 'invalid' };
  }

  if (user.status === 'suspended') return { error: 'suspended' };
  db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
  return { user };
}

/** Sets a new password and lifts any lockout. */
function setPassword(db, id, password) {
  db.prepare(`UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ?
    WHERE id = ?`).run(bcrypt.hashSync(password, BCRYPT_COST), new Date().toISOString(), id);
}

module.exports = {
  createUser, findUserByEmail, findUserById, emailInUse, authenticate, setPassword, BCRYPT_COST,
};
