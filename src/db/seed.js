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
  { name: 'Maria Capitã', email: 'capita@arenalocal.com', password: 'Senha@123', role: 'user', status: 'active', city: 'Itajubá' },
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

const athletes = (names) => names.map((name, i) => ({ name, number: String(i + 1) }));

const TEAMS = [
  {
    name: 'Unidos de Itajubá', owner: 'usuario@arenalocal.com', sport: 'futsal', city: 'Itajubá',
    athletes: athletes(['Pedro Alves', 'Lucas Lima', 'Rafael Costa', 'Bruno Dias', 'Thiago Rocha', 'Diego Melo']),
  },
  {
    name: 'Leoas da Serra', owner: 'capita@arenalocal.com', sport: 'futsal', city: 'Itajubá',
    athletes: athletes(['Ana Souza', 'Beatriz Reis', 'Carla Nunes', 'Daniela Prado', 'Elisa Moura', 'Fernanda Luz']),
  },
  {
    name: 'Vôlei Sapucaí', owner: 'capita@arenalocal.com', sport: 'volleyball', city: 'Santa Rita do Sapucaí',
    athletes: athletes(['Gabriela Pinto', 'Helena Faria', 'Isabela Torres', 'Júlia Campos', 'Karina Vaz', 'Larissa Rios']),
  },
];

// team: null is an individual registration (street run) made by `user`.
const REGISTRATIONS = [
  { championship: 'Copa Itajubá de Futsal', category: 'Adulto', team: 'Unidos de Itajubá', user: 'usuario@arenalocal.com', status: 'pending' },
  { championship: 'Copa Itajubá de Futsal', category: 'Adulto', team: 'Leoas da Serra', user: 'capita@arenalocal.com', status: 'approved' },
  {
    championship: 'Liga de Vôlei Santa Rita', category: 'Feminino', team: 'Vôlei Sapucaí', user: 'capita@arenalocal.com',
    status: 'refused', refuseReason: 'Equipe incompleta',
  },
  { championship: 'Corrida Rústica de Pouso Alegre', category: '5 km', team: null, user: 'usuario@arenalocal.com', status: 'pending' },
];

/** Wipes every table and inserts the fixed demo/test data. */
function seed(db) {
  const now = new Date().toISOString();
  const today = todayIso();

  db.transaction(() => {
    for (const table of ['registrations', 'team_athletes', 'teams', 'outbox', 'championship_categories', 'championships',
      'password_resets', 'users', 'cities']) {
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

    const teamIds = {};
    const insertTeam = db.prepare(`INSERT INTO teams (owner_id, name, sport, city_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`);
    const insertAthlete = db.prepare('INSERT INTO team_athletes (team_id, name, number, position) VALUES (?, ?, ?, ?)');
    for (const t of TEAMS) {
      const id = insertTeam.run(userIds[t.owner], t.name, t.sport, cityIds[t.city], now, now).lastInsertRowid;
      t.athletes.forEach((a, i) => insertAthlete.run(id, a.name, a.number, i + 1));
      teamIds[t.name] = id;
    }

    const category = db.prepare(`SELECT cc.id AS categoryId, c.id AS championshipId FROM championship_categories cc
      JOIN championships c ON c.id = cc.championship_id WHERE c.name = ? AND cc.name = ?`);
    const insertRegistration = db.prepare(`INSERT INTO registrations
      (championship_id, category_id, team_id, user_id, status, refuse_reason, decided_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of REGISTRATIONS) {
      const { categoryId, championshipId } = category.get(r.championship, r.category);
      const decided = r.status === 'approved' || r.status === 'refused' ? now : null;
      insertRegistration.run(championshipId, categoryId, r.team ? teamIds[r.team] : null, userIds[r.user], r.status,
        r.refuseReason ?? null, decided, now, now);
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
