const { todayIso } = require('../validation/dates');

/** "Em inscrição" until the registration deadline, then "Em andamento" until finished/cancelled. */
function displayStatus(row, today = todayIso()) {
  if (row.status !== 'active') return row.status;
  return today <= row.registration_deadline ? 'open' : 'in_progress';
}

function organizerName(row) {
  if (row.organizer_deleted_at) return 'Organizador removido';
  return row.organizer_league_name || row.organizer_user_name;
}

const SELECT = `SELECT championships.*, cities.name AS city_name,
    users.name AS organizer_user_name, users.league_name AS organizer_league_name,
    users.deleted_at AS organizer_deleted_at
  FROM championships
  JOIN cities ON cities.id = championships.city_id
  JOIN users ON users.id = championships.organizer_id`;

function categoriesOf(db, championshipId) {
  return db.prepare('SELECT name FROM championship_categories WHERE championship_id = ? ORDER BY id')
    .all(championshipId).map((c) => c.name);
}

/** Adds the derived fields every view uses. */
function decorate(db, row, today) {
  return {
    ...row,
    categories: categoriesOf(db, row.id),
    organizerName: organizerName(row),
    displayStatus: displayStatus(row, today),
  };
}

function insertCategories(db, championshipId, categories) {
  const insert = db.prepare('INSERT INTO championship_categories (championship_id, name) VALUES (?, ?)');
  for (const name of categories) insert.run(championshipId, name);
}

function createChampionship(db, organizerId, data) {
  const now = new Date().toISOString();
  return db.transaction(() => {
    const id = Number(db.prepare(`INSERT INTO championships
      (organizer_id, name, sport, city_id, venue, start_date, end_date, registration_deadline, format,
       max_slots, rules, contact, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`).run(
      organizerId, data.name, data.sport, data.cityId, data.venue, data.startDate, data.endDate,
      data.registrationDeadline, data.format, data.maxSlots, data.rules, data.contact, now, now,
    ).lastInsertRowid);
    insertCategories(db, id, data.categories);
    return id;
  })();
}

function getChampionship(db, id, today = todayIso()) {
  const row = db.prepare(`${SELECT} WHERE championships.id = ?`).get(id);
  return row ? decorate(db, row, today) : undefined;
}

module.exports = {
  displayStatus, createChampionship, getChampionship, decorate, insertCategories, SELECT,
};
