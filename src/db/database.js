const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

/** Opens (creating if needed) the SQLite file and applies the schema. */
function openDatabase(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

/**
 * Deletes the SQLite file (and its WAL files) and opens a fresh one. `CREATE TABLE IF NOT EXISTS` never
 * changes a table that already exists, so a database from an earlier release needs this to get new
 * columns and CHECK lists.
 */
function resetDatabase(file) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  return openDatabase(file);
}

module.exports = { openDatabase, resetDatabase };
