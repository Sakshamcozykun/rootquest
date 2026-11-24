const Database = require('better-sqlite3');
const { DB_FILE } = require('./config');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  streak INTEGER NOT NULL DEFAULT 0,
  last_daily_date TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  points INTEGER NOT NULL,
  description TEXT NOT NULL,
  flag_type TEXT NOT NULL DEFAULT 'dynamic' CHECK (flag_type IN ('dynamic','static')),
  static_flag TEXT,
  lab TEXT,
  skills TEXT NOT NULL DEFAULT '',
  writeup TEXT NOT NULL DEFAULT '',
  real_world_link TEXT NOT NULL DEFAULT '',
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS hints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
  text TEXT NOT NULL,
  UNIQUE (challenge_id, level)
);

CREATE TABLE IF NOT EXISTS hint_unlocks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, challenge_id, level)
);

CREATE TABLE IF NOT EXISTS timed_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  duration_min INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS solves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  points_awarded INTEGER NOT NULL,
  hint_penalty_pct INTEGER NOT NULL DEFAULT 0,
  session_id INTEGER REFERENCES timed_sessions(id) ON DELETE SET NULL,
  solved_at INTEGER NOT NULL,
  UNIQUE (user_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  correct INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  same_group INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_solves_user ON solves(user_id);
CREATE INDEX IF NOT EXISTS idx_solves_challenge ON solves(challenge_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_ch ON submissions(user_id, challenge_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON group_members(user_id);
`);

module.exports = db;
