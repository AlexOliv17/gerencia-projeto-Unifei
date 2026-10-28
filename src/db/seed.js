const bcrypt = require('bcryptjs');
const { addDaysIso, todayIso } = require('../validation/dates');

const CITIES = [
  'Itajubá', 'Pouso Alegre', 'Santa Rita do Sapucaí', 'Piranguinho',
  'Brazópolis', 'Maria da Fé', 'Wenceslau Braz', 'Delfim Moreira',
];

const USERS = [
  { name: 'Admin Arena', email: 'admin@arenalocal.com', password: 'Admin@123', role: 'admin', status: 'active', city: 'Itajubá' },
  {
    name: 'Carlos Organizador', email: 'organizador@arenalocal.com', password: 'Senha@123', role: 'organizer', status: 'active',
    city: 'Itajubá', document: '12345678000190', leagueName: 'Liga Sul Mineira',
  },
  {
    name: 'Paula Pendente', email: 'pendente@arenalocal.com', password: 'Senha@123', role: 'organizer', status: 'pending',
    city: 'Pouso Alegre', document: '12345678901', leagueName: 'Liga Pouso Alegre',
  },
  { name: 'João Torcedor', email: 'usuario@arenalocal.com', password: 'Senha@123', role: 'user', status: 'active', city: 'Itajubá' },
];

// Day offsets are relative to today so the derived status ("Em inscrição", "Em andamento") stays true.
const CHAMPIONSHIPS = [
  {
    name: 'Copa Itajubá de Futsal', sport: 'futsal', city: 'Itajubá', venue: 'Ginásio Municipal',
    start: 20, end: 40, deadline: 10, format: 'groups_knockout', categories: ['Adulto', 'Sub-17'],
    maxSlots: 16, contact: '(35) 99999-0001',
  },
  {
    name: 'Corrida Rústica de Pouso Alegre', sport: 'street_run', city: 'Pouso Alegre', venue: 'Avenida Dique II',
    start: 30, end: 30, deadline: 25, format: 'individual', categories: ['5 km', '10 km'],
  },
  {
    name: 'Liga de Vôlei Santa Rita', sport: 'volleyball', city: 'Santa Rita do Sapucaí', venue: 'Quadra do Inatel',
    start: -10, end: 20, deadline: -15, format: 'round_robin', categories: ['Feminino'],
  },
  {
    name: 'Torneio de Futebol de Verão', sport: 'football', city: 'Itajubá', venue: 'Estádio Municipal',
    start: -60, end: -30, deadline: -70, format: 'knockout', categories: ['Adulto'], status: 'finished',
  },
  {
    name: 'Copa Piranguinho', sport: 'football', city: 'Piranguinho', venue: 'Campo do Centro',
    start: 15, end: 16, deadline: 5, format: 'knockout', categories: ['Masculino'],
    status: 'cancelled', cancelReason: 'Falta de inscritos',
  },
];

/** Wipes every table and inserts the fixed demo/test data. */
function seed(db) {
  const now = new Date().toISOString();
  const today = todayIso();

  db.transaction(() => {
    for (const table of ['outbox', 'championship_categories', 'championships', 'password_resets', 'users', 'cities']) {
      db.prepare(`DELETE FROM ${table}`).run();
    }

    const cityIds = {};
    const insertCity = db.prepare('INSERT INTO cities (name, state) VALUES (?, ?)');
    for (const name of CITIES) cityIds[name] = insertCity.run(name, 'MG').lastInsertRowid;

    const userIds = {};
    const insertUser = db.prepare(`INSERT INTO users
      (name, email, password_hash, city_id, role, status, document, league_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const u of USERS) {
      userIds[u.email] = insertUser.run(
        u.name, u.email, bcrypt.hashSync(u.password, 10), cityIds[u.city], u.role, u.status,
        u.document ?? null, u.leagueName ?? null, now, now,
      ).lastInsertRowid;
    }

    const insertChampionship = db.prepare(`INSERT INTO championships
      (organizer_id, name, sport, city_id, venue, start_date, end_date, registration_deadline, format,
       max_slots, rules, contact, status, cancel_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertCategory = db.prepare('INSERT INTO championship_categories (championship_id, name) VALUES (?, ?)');
    for (const c of CHAMPIONSHIPS) {
      const id = insertChampionship.run(
        userIds['organizador@arenalocal.com'], c.name, c.sport, cityIds[c.city], c.venue,
        addDaysIso(today, c.start), addDaysIso(today, c.end), addDaysIso(today, c.deadline), c.format,
        c.maxSlots ?? null, 'Regulamento disponível com a organização.', c.contact ?? null,
        c.status ?? 'active', c.cancelReason ?? null, now, now,
      ).lastInsertRowid;
      for (const category of c.categories) insertCategory.run(id, category);
    }
  })();
}

if (require.main === module) {
  const config = require('../config');
  const { openDatabase } = require('./database');
  const db = openDatabase(config.dbPath);
  seed(db);
  db.close();
  console.log(`Banco recriado com dados de exemplo em ${config.dbPath}`);
}

module.exports = { seed };
