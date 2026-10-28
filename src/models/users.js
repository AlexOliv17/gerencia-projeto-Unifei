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

const UPDATABLE = {
  name: 'name',
  email: 'email',
  cityId: 'city_id',
  role: 'role',
  status: 'status',
  document: 'document',
  leagueName: 'league_name',
};

/** Updates only the given fields (keys as returned by validateUserInput's data). */
function updateUser(db, id, fields) {
  const keys = Object.keys(fields).filter((k) => k in UPDATABLE);
  if (!keys.length) return;
  const sets = keys.map((k) => `${UPDATABLE[k]} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${sets}, updated_at = ? WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), new Date().toISOString(), id);
}

function verifyPassword(user, password) {
  return Boolean(user.password_hash) && bcrypt.compareSync(String(password ?? ''), user.password_hash);
}

/**
 * Account deletion (LGPD): personal data is wiped but the row stays so championships keep their
 * organizer reference. The original e-mail becomes free for a new sign-up, and the simulated
 * password e-mails (which carry the name and address) are deleted with the reset tokens.
 */
function anonymizeUser(db, id, now = new Date()) {
  db.transaction(() => {
    const { email } = db.prepare('SELECT email FROM users WHERE id = ?').get(id);
    db.prepare("DELETE FROM outbox WHERE type = 'password_reset' AND recipient = ?").run(email);
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(id);
    db.prepare(`UPDATE users SET name = 'Usuário removido', email = ?, password_hash = '', document = NULL,
      league_name = NULL, status = 'suspended', failed_login_attempts = 0, locked_until = NULL,
      deleted_at = ?, updated_at = ? WHERE id = ?`)
      .run(`removed-${id}@arenalocal.invalid`, now.toISOString(), now.toISOString(), id);
  })();
}

/** Admin search (Tabela 02): partial name/e-mail, exact role/status; deleted accounts never listed. */
function searchUsers(db, { name, email, role, status } = {}) {
  const where = ['users.deleted_at IS NULL'];
  const params = [];
  if (name) { where.push('users.name LIKE ?'); params.push(`%${name.trim()}%`); }
  if (email) { where.push('users.email LIKE ?'); params.push(`%${email.trim().toLowerCase()}%`); }
  if (role) { where.push('users.role = ?'); params.push(role); }
  if (status) { where.push('users.status = ?'); params.push(status); }
  return db.prepare(`SELECT users.*, cities.name AS city_name
    FROM users JOIN cities ON cities.id = users.city_id
    WHERE ${where.join(' AND ')} ORDER BY users.name COLLATE NOCASE`).all(...params);
}

function countActiveAdmins(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active' AND deleted_at IS NULL")
    .get().n;
}

function isLastActiveAdmin(db, user) {
  return user.role === 'admin' && user.status === 'active' && countActiveAdmins(db) <= 1;
}

module.exports = {
  createUser, findUserByEmail, findUserById, emailInUse, authenticate, setPassword, updateUser, verifyPassword,
  anonymizeUser, searchUsers, countActiveAdmins, isLastActiveAdmin, BCRYPT_COST,
};
