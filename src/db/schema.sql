CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'organizer', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'pending', 'suspended')),
  document TEXT,
  league_name TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS championships (
  id INTEGER PRIMARY KEY,
  organizer_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  sport TEXT NOT NULL CHECK (sport IN ('football', 'futsal', 'volleyball', 'street_run')),
  city_id INTEGER NOT NULL REFERENCES cities(id),
  venue TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  registration_deadline TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('round_robin', 'knockout', 'groups_knockout', 'individual')),
  max_slots INTEGER,
  rules TEXT,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'cancelled')),
  cancel_reason TEXT,
  allow_waitlist INTEGER NOT NULL DEFAULT 0,
  points_win INTEGER NOT NULL DEFAULT 3,
  points_draw INTEGER NOT NULL DEFAULT 1,
  points_loss INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS championship_categories (
  id INTEGER PRIMARY KEY,
  championship_id INTEGER NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('password_reset', 'championship_changed', 'championship_cancelled', 'registration_result')),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  sport TEXT NOT NULL CHECK (sport IN ('football', 'futsal', 'volleyball')),
  city_id INTEGER NOT NULL REFERENCES cities(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_athletes (
  id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  number TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY,
  championship_id INTEGER NOT NULL REFERENCES championships(id),
  category_id INTEGER NOT NULL REFERENCES championship_categories(id),
  team_id INTEGER REFERENCES teams(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'refused', 'cancelled', 'waitlist')),
  refuse_reason TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  championship_id INTEGER NOT NULL REFERENCES championships(id),
  category_id INTEGER NOT NULL REFERENCES championship_categories(id),
  kind TEXT NOT NULL CHECK (kind IN ('league', 'knockout')),
  round TEXT NOT NULL,
  round_number INTEGER NOT NULL DEFAULT 1,
  group_name TEXT,
  registration_a_id INTEGER REFERENCES registrations(id),
  registration_b_id INTEGER REFERENCES registrations(id),
  match_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  venue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  score_a INTEGER,
  score_b INTEGER,
  points_a INTEGER,
  points_b INTEGER,
  next_match_id INTEGER REFERENCES matches(id),
  next_slot TEXT CHECK (next_slot IN ('a', 'b')),
  result_updated_at TEXT,
  result_updated_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS race_starts (
  id INTEGER PRIMARY KEY,
  championship_id INTEGER NOT NULL REFERENCES championships(id),
  category_id INTEGER NOT NULL UNIQUE REFERENCES championship_categories(id),
  start_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  venue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS race_results (
  id INTEGER PRIMARY KEY,
  registration_id INTEGER NOT NULL UNIQUE REFERENCES registrations(id),
  finish_seconds INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS result_history (
  id INTEGER PRIMARY KEY,
  championship_id INTEGER NOT NULL REFERENCES championships(id),
  match_id INTEGER REFERENCES matches(id),
  registration_id INTEGER REFERENCES registrations(id),
  description TEXT NOT NULL,
  changed_by INTEGER NOT NULL REFERENCES users(id),
  changed_at TEXT NOT NULL
);
