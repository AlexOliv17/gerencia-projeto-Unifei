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
  type TEXT NOT NULL CHECK (type IN ('password_reset', 'championship_changed', 'championship_cancelled')),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  created_at TEXT NOT NULL
);
