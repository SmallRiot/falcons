import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { config } from './config.ts';

export const db = new DatabaseSync(path.join(config.dataDir, 'falcons.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,           -- telegram id
  first_name      TEXT NOT NULL DEFAULT '',
  last_name       TEXT,
  username        TEXT,
  photo_url       TEXT,
  number          INTEGER,
  position        TEXT,                          -- F | D | G
  birth_date      TEXT,                          -- YYYY-MM-DD
  roles           TEXT NOT NULL DEFAULT '',      -- admin,coach,service
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | active | rejected
  signup_blocked  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- составы клуба (например, одна команда первого дивизиона и две второго)
CREATE TABLE IF NOT EXISTS squads (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  short    TEXT NOT NULL,                        -- метка в таблицах: «Д1», «Про»…
  color    TEXT NOT NULL DEFAULT '#2b88cf',
  division INTEGER,
  sort     INTEGER NOT NULL DEFAULT 0
);

-- игрок может быть сразу в нескольких составах
CREATE TABLE IF NOT EXISTS user_squads (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  squad_id INTEGER NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, squad_id)
);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL,                    -- training | game
  title        TEXT,
  starts_at    TEXT NOT NULL,                    -- ISO UTC
  duration_min INTEGER NOT NULL DEFAULT 90,
  location     TEXT,
  capacity     INTEGER,
  notes        TEXT,
  cancelled    INTEGER NOT NULL DEFAULT 0,
  lineup_published INTEGER NOT NULL DEFAULT 0,
  tg_message_id INTEGER,                         -- пост в командном чате (обновляем счётчик)
  score_us     INTEGER,                          -- счёт игры
  score_them   INTEGER,
  created_by   INTEGER,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- для каких составов событие; нет строк = для всего клуба
CREATE TABLE IF NOT EXISTS event_squads (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  squad_id INTEGER NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, squad_id)
);

CREATE TABLE IF NOT EXISTS signups (
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,                      -- in | out
  attended   INTEGER,                            -- факт от тренера: 1 был, 0 не был, NULL = как записался
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS lineups (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team     TEXT NOT NULL DEFAULT '',             -- '' одна команда | dark | light
  line     INTEGER NOT NULL,                     -- 0 = вратари, 1..4 пятёрки
  slot     TEXT NOT NULL,                        -- LW C RW LD RD G1 G2
  PRIMARY KEY (event_id, user_id),
  UNIQUE (event_id, team, line, slot)
);

CREATE TABLE IF NOT EXISTS periods (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  month           TEXT NOT NULL UNIQUE,          -- YYYY-MM
  budget          REAL NOT NULL,
  partial_ratio   REAL NOT NULL DEFAULT 0.7,
  donation_amount REAL NOT NULL DEFAULT 100,
  locked          INTEGER NOT NULL DEFAULT 0,    -- 1 = сбор начат: суммы зафиксированы, неоплата = долг
  locked_full     REAL,                          -- ставки на момент старта сбора
  locked_partial  REAL,
  tg_message_id   INTEGER,                       -- пост опроса в командном чате
  due_date        TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS dues (
  period_id     INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan          TEXT,                            -- full | partial | donation | exempt
  amount        REAL,                            -- фиксируется при locked
  custom_amount REAL,                            -- ручная сумма от админа
  status        TEXT NOT NULL DEFAULT 'unpaid',  -- unpaid | pending | paid | rejected
  proof         TEXT,
  comment       TEXT,
  submitted_at  TEXT,
  reviewed_by   INTEGER,
  reviewed_at   TEXT,
  PRIMARY KEY (period_id, user_id)
);

CREATE TABLE IF NOT EXISTS sharpenings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note        TEXT,
  proof       TEXT,
  price       REAL NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new',       -- new | accepted | done | rejected
  payment     TEXT NOT NULL DEFAULT 'pending',   -- unpaid (долг) | pending (скрин на проверке) | paid
  comment     TEXT,
  handled_by  INTEGER,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  bank     TEXT NOT NULL,                        -- TBC | BOG | Liberty | ...
  holder   TEXT NOT NULL,
  iban     TEXT NOT NULL,
  purpose  TEXT NOT NULL DEFAULT 'dues',         -- dues | sharpening
  pay_url  TEXT,                                 -- платёжная ссылка/QR-страница банка, если есть
  note     TEXT,
  sort     INTEGER NOT NULL DEFAULT 0
);

-- лента уведомлений в приложении (дублирует личные сообщения бота)
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  link       TEXT,                               -- start-параметр экрана
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, id);

-- когда последний раз напоминали (ключ вида debt:dues:42)
CREATE TABLE IF NOT EXISTS notify_log (
  key     TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

/** Миграции для уже существующей базы: добавляем колонки, которых нет (CREATE TABLE IF NOT EXISTS их не добавит). */
function addColumn(table: string, column: string, def: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
}
addColumn('users', 'language', "TEXT CHECK(language IN ('ru','en'))");
addColumn('users', 'birth_date', 'TEXT');
// событие из серии ждёт, когда до него останется неделя, чтобы бот запостил его в чат
addColumn('events', 'announce_pending', 'INTEGER NOT NULL DEFAULT 0');
addColumn('periods', 'tg_message_id', 'INTEGER');
addColumn('periods', 'locked_full', 'REAL');
addColumn('periods', 'locked_partial', 'REAL');
addColumn('events', 'tg_message_id', 'INTEGER');
addColumn('events', 'score_us', 'INTEGER');
addColumn('events', 'score_them', 'INTEGER');
addColumn('signups', 'attended', 'INTEGER');
addColumn('sharpenings', 'payment', "TEXT NOT NULL DEFAULT 'pending'");
addColumn('lineups', 'team', "TEXT NOT NULL DEFAULT ''");
// роль «гость»: цена за выход на лёд и оплаты за каждое событие
addColumn('users', 'guest_price', 'REAL');
db.exec(`
CREATE TABLE IF NOT EXISTS guest_fees (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     REAL NOT NULL,
  status     TEXT NOT NULL DEFAULT 'unpaid',      -- unpaid | pending | paid
  proof      TEXT,
  comment    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT,
  UNIQUE (event_id, user_id)
);`);

export const nowIso = () => new Date().toISOString();

export function getSetting(key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}
export function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}

/** guest — платит за каждый выход на лёд (users.guest_price), во взносах не участвует */
export type Role = 'admin' | 'coach' | 'service' | 'guest';
export interface UserRow {
  id: number;
  first_name: string;
  last_name: string | null;
  username: string | null;
  photo_url: string | null;
  number: number | null;
  position: string | null;
  birth_date: string | null;
  roles: string;
  status: 'pending' | 'active' | 'rejected' | 'guest';
  guest_price?: number | null;
  signup_blocked: number;
  created_at: string;
}

export const rolesOf = (u: Pick<UserRow, 'roles'>): Role[] => u.roles.split(',').filter(Boolean) as Role[];
export const hasRole = (u: Pick<UserRow, 'roles'>, ...r: Role[]) => rolesOf(u).some((x) => r.includes(x));
export const displayName = (u: Pick<UserRow, 'first_name' | 'last_name'>) =>
  [u.first_name, u.last_name].filter(Boolean).join(' ');

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    name: displayName(u),
    first_name: u.first_name,
    last_name: u.last_name,
    username: u.username,
    photo_url: u.photo_url,
    number: u.number,
    position: u.position,
    birth_date: u.birth_date ?? null,
    /** гость без Telegram, записанный админом/тренером на событие */
    guest: u.status === 'guest',
  };
}

/** Профиль заполнен: имя, фамилия и дата рождения. Иначе после одобрения просим заполнить. */
export const profileComplete = (u: Pick<UserRow, 'first_name' | 'last_name' | 'birth_date'>) =>
  !!u.first_name?.trim() && !!u.last_name?.trim() && !!u.birth_date;

/** YYYY-MM-DD, реальная дата, возраст 5–90 лет. */
export function validBirthDate(s: unknown): string | null {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  const age = (Date.now() - d.getTime()) / (365.25 * 864e5);
  return age >= 5 && age <= 90 ? s : null;
}
