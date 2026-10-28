const crypto = require('node:crypto');
const { RESET_TOKEN_TTL_MINUTES } = require('../constants');

function createResetToken(db, userId, now = new Date()) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
  db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, token, expiresAt);
  return token;
}

/** User id of an unused, unexpired token, or null. */
function findValidResetToken(db, token, now = new Date()) {
  const row = db.prepare(`SELECT password_resets.user_id, password_resets.expires_at
    FROM password_resets JOIN users ON users.id = password_resets.user_id
    WHERE token = ? AND used_at IS NULL AND users.deleted_at IS NULL`).get(String(token));
  if (!row || new Date(row.expires_at) <= now) return null;
  return row.user_id;
}

/** Like findValidResetToken, but marks the token as used so it cannot be replayed. */
function consumeResetToken(db, token, now = new Date()) {
  const userId = findValidResetToken(db, token, now);
  if (userId) db.prepare('UPDATE password_resets SET used_at = ? WHERE token = ?').run(now.toISOString(), String(token));
  return userId;
}

module.exports = { createResetToken, findValidResetToken, consumeResetToken };
