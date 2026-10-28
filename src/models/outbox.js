/** Simulated e-mail: messages are stored and listed to the admin instead of being sent (real sending is RFC10). */
function addOutbox(db, { type, recipient, subject, body, link = null }) {
  const id = Number(db.prepare(`INSERT INTO outbox (type, recipient, subject, body, link, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(type, recipient, subject, body, link, new Date().toISOString()).lastInsertRowid);
  console.log(`[outbox] ${subject} -> ${recipient}`);
  return id;
}

function listOutbox(db) {
  return db.prepare('SELECT * FROM outbox ORDER BY id DESC').all();
}

module.exports = { addOutbox, listOutbox };
