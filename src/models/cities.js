function listCities(db) {
  return db.prepare('SELECT id, name, state FROM cities ORDER BY id').all();
}

module.exports = { listCities };
