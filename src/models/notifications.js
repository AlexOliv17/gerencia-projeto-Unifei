const { NOTIFICATION_TYPES } = require('../constants');
const { addOutbox } = require('./outbox');

/** Types the person switched off (no row = on). */
function disabledTypes(db, userId) {
  return new Set(db.prepare('SELECT type FROM notification_preferences WHERE user_id = ? AND enabled = 0').all(userId)
    .map((r) => r.type));
}

function preferences(db, userId) {
  const off = disabledTypes(db, userId);
  return Object.fromEntries(Object.keys(NOTIFICATION_TYPES).map((type) => [type, !off.has(type)]));
}

function savePreferences(db, userId, enabledTypes) {
  const upsert = db.prepare(`INSERT INTO notification_preferences (user_id, type, enabled) VALUES (?, ?, ?)
    ON CONFLICT (user_id, type) DO UPDATE SET enabled = excluded.enabled`);
  db.transaction(() => {
    for (const type of Object.keys(NOTIFICATION_TYPES)) upsert.run(userId, type, enabledTypes.has(type) ? 1 : 0);
  })();
}

/**
 * RFS18: the single way a notice goes out. Each person gets it once (repeated ids collapse; a `dedupeKey` also
 * stops a reminder already sent), never the author of the change, a removed account or someone who switched the
 * type off. The notice is listed in "Meus avisos" and mailed through the outbox (simulated e-mail).
 * Returns how many people were notified.
 */
function notify(db, {
  userIds, type, outboxType = type, title, body, link = null, dedupeKey = null, exceptUserId = null,
}) {
  const recipients = [...new Set(userIds)].filter((id) => id && id !== exceptUserId);
  if (!recipients.length) return 0;
  const people = db.prepare(`SELECT id, email FROM users WHERE id IN (${recipients.map(() => '?').join(', ')})
    AND deleted_at IS NULL`).all(...recipients);
  const insert = db.prepare(`INSERT OR IGNORE INTO notifications (user_id, type, title, body, link, dedupe_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  let sent = 0;
  for (const person of people) {
    if (disabledTypes(db, person.id).has(type)) continue;
    const { changes } = insert.run(person.id, type, title, body, link, dedupeKey, new Date().toISOString());
    if (!changes) continue;
    addOutbox(db, { type: outboxType, recipient: person.email, subject: title, body, link });
    sent += 1;
  }
  return sent;
}

function listNotifications(db, userId) {
  return db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(userId);
}

function unreadCount(db, userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId).n;
}

function markAllRead(db, userId) {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(new Date().toISOString(), userId);
}

module.exports = {
  preferences, savePreferences, notify, listNotifications, unreadCount, markAllRead,
};
