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

const DISPLAY_STATUS_SQL = `CASE
    WHEN championships.status = 'active' AND :today <= championships.registration_deadline THEN 'open'
    WHEN championships.status = 'active' THEN 'in_progress'
    ELSE championships.status END`;

/** Shared WHERE pieces for the period filter: [start_date, end_date] overlaps [dateFrom, dateTo]; one bound alone means that single day. */
function periodClause(where, params, { dateFrom, dateTo }) {
  if (!dateFrom && !dateTo) return;
  params.from = dateFrom || dateTo;
  params.to = dateTo || dateFrom;
  where.push('championships.start_date <= :to AND championships.end_date >= :from');
}

/** Organizer ("Meus campeonatos") and admin lists: Tabela 04 filters on the displayed status. */
function searchChampionships(db, { organizerId, name, sport, status, dateFrom, dateTo } = {}, today = todayIso()) {
  const where = ['1 = 1'];
  const params = { today };
  if (organizerId) { where.push('championships.organizer_id = :organizerId'); params.organizerId = organizerId; }
  if (name) { where.push('championships.name LIKE :name'); params.name = `%${name.trim()}%`; }
  if (sport) { where.push('championships.sport = :sport'); params.sport = sport; }
  if (status) { where.push(`${DISPLAY_STATUS_SQL} = :status`); params.status = status; }
  periodClause(where, params, { dateFrom, dateTo });
  return db.prepare(`${SELECT} WHERE ${where.join(' AND ')}
    ORDER BY championships.start_date, championships.name`).all(params).map((row) => decorate(db, row, today));
}

/**
 * RFS12 public search (Tabela 07). Cancelled championships are never listed. Order: current and upcoming
 * first by start date (nearest first), then past ones, most recent first.
 */
function searchPublicChampionships(db, {
  cityId, sport, category, dateFrom, dateTo, openOnly,
} = {}, today = todayIso()) {
  const where = ["championships.status <> 'cancelled'"];
  const params = { today };
  if (cityId) { where.push('championships.city_id = :cityId'); params.cityId = cityId; }
  if (sport) { where.push('championships.sport = :sport'); params.sport = sport; }
  if (category) {
    where.push(`EXISTS (SELECT 1 FROM championship_categories cc
      WHERE cc.championship_id = championships.id AND cc.name LIKE :category)`);
    params.category = `%${category.trim()}%`;
  }
  if (openOnly) where.push(`${DISPLAY_STATUS_SQL} = 'open'`);
  periodClause(where, params, { dateFrom, dateTo });
  return db.prepare(`${SELECT} WHERE ${where.join(' AND ')}
    ORDER BY CASE WHEN championships.end_date >= :today THEN 0 ELSE 1 END,
      CASE WHEN championships.end_date >= :today THEN championships.start_date END ASC,
      championships.start_date DESC, championships.name`).all(params).map((row) => decorate(db, row, today));
}

/** Returns whether dates or place changed, which is what inscribed people and followers must be told about. */
function updateChampionship(db, id, data) {
  return db.transaction(() => {
    const before = db.prepare('SELECT * FROM championships WHERE id = ?').get(id);
    db.prepare(`UPDATE championships SET name = ?, sport = ?, city_id = ?, venue = ?, start_date = ?, end_date = ?,
      registration_deadline = ?, format = ?, max_slots = ?, rules = ?, contact = ?, updated_at = ? WHERE id = ?`).run(
      data.name, data.sport, data.cityId, data.venue, data.startDate, data.endDate, data.registrationDeadline,
      data.format, data.maxSlots, data.rules, data.contact, new Date().toISOString(), id,
    );
    db.prepare('DELETE FROM championship_categories WHERE championship_id = ?').run(id);
    insertCategories(db, id, data.categories);
    const changedSchedule = before.start_date !== data.startDate || before.end_date !== data.endDate
      || before.registration_deadline !== data.registrationDeadline || before.venue !== data.venue
      || before.city_id !== data.cityId;
    return { changedSchedule };
  })();
}

function finishChampionship(db, id) {
  db.prepare("UPDATE championships SET status = 'finished', updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

function cancelChampionship(db, id, reason) {
  db.prepare("UPDATE championships SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?")
    .run(reason, new Date().toISOString(), id);
}

/** Admin manages any championship; an organizer only their own. */
function canManage(user, championship) {
  if (!user) return false;
  return user.role === 'admin' || (user.role === 'organizer' && championship.organizer_id === user.id);
}

module.exports = {
  displayStatus, createChampionship, getChampionship, decorate, insertCategories, searchChampionships,
  searchPublicChampionships,
  updateChampionship, finishChampionship, cancelChampionship, canManage, periodClause, SELECT, DISPLAY_STATUS_SQL,
};
