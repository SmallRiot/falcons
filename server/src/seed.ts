/**
 * Демо-данные для теста в браузере (DEV_AUTH=1).
 * Запуск: npm run seed  (существующие данные НЕ трогаются, если в базе уже есть пользователи; --force — пересоздать)
 */
import { rmSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

if (process.argv.includes('--force')) {
  for (const f of ['falcons.db', 'falcons.db-wal', 'falcons.db-shm']) rmSync(path.join(config.dataDir, f), { force: true });
}

const { db } = await import('./db.ts');
const { ensureDues, lockPeriod } = await import('./finance.ts');

if ((db.prepare('SELECT COUNT(*) c FROM users').get() as { c: number }).c > 0) {
  console.log('В базе уже есть данные. Для пересоздания: npm run seed -- --force');
  process.exit(0);
}

const people: [number, string, string, number, string, string, string?][] = [
  // id, имя, фамилия, номер, позиция, роли, статус
  [1, 'Админ', 'Демо', 8, 'F', 'admin'],
  [2, 'Тренер', 'Демо', 0, 'F', 'coach'],
  [3, 'Сервис', 'Демо', 77, 'D', 'service'],
  [4, 'Игорь', 'Волков', 17, 'F', ''],
  [5, 'Артём', 'Соколов', 91, 'F', ''],
  [6, 'Дмитрий', 'Лебедев', 13, 'F', ''],
  [7, 'Никита', 'Козлов', 22, 'F', ''],
  [8, 'Павел', 'Новиков', 44, 'D', ''],
  [9, 'Сергей', 'Морозов', 5, 'D', ''],
  [10, 'Андрей', 'Петров', 71, 'F', ''],
  [11, 'Глеб', 'Орлов', 30, 'G', ''],
  [12, 'Максим', 'Зайцев', 19, 'F', ''],
  [13, 'Роман', 'Павлов', 27, 'D', ''],
  [14, 'Кирилл', 'Семёнов', 88, 'F', ''],
  [15, 'Егор', 'Голубев', 2, 'D', ''],
  [16, 'Тимур', 'Виноградов', 63, 'F', ''],
  [17, 'Лев', 'Богданов', 35, 'G', ''],
  [18, 'Олег', 'Фёдоров', 9, 'F', ''],
  [19, 'Илья', 'Михайлов', 6, 'D', ''],
  [20, 'Степан', 'Беляев', 11, 'F', ''],
  [21, 'Новичок', 'Ждущий', 99, 'F', '', 'pending'],
];
const insU = db.prepare('INSERT INTO users(id, first_name, last_name, number, position, roles, status) VALUES(?,?,?,?,?,?,?)');
for (const [id, fn, ln, num, pos, roles, status] of people) insU.run(id, fn, ln, num, pos, roles, status ?? 'active');

// дни рождения: у одного — сегодня (чтобы проверить поздравление), у части не заполнено (увидят анкету)
const todayMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi' }).format(new Date()).slice(5);
for (let u = 1; u <= 20; u++) {
  if (u === 4 || u === 12) continue;
  const md = u === 7 ? todayMD : `${String((u % 12) + 1).padStart(2, '0')}-${String(((u * 7) % 27) + 1).padStart(2, '0')}`;
  db.prepare('UPDATE users SET birth_date = ? WHERE id = ?').run(`${1985 + (u % 15)}-${md}`, u);
}

// составы: один первого дивизиона и два второго — названия меняются в админке
const insSq = db.prepare('INSERT INTO squads(name, short, color, division, sort) VALUES(?,?,?,?,?)');
insSq.run('Falcons', 'Д1', '#2b88cf', 1, 1);
insSq.run('Falcons Blue', 'Д2-А', '#1f9d6b', 2, 2);
insSq.run('Falcons White', 'Д2-Б', '#c98612', 2, 3);
const insUS = db.prepare('INSERT OR IGNORE INTO user_squads(user_id, squad_id) VALUES(?,?)');
for (let u = 1; u <= 20; u++) {
  insUS.run(u, u <= 10 ? 1 : u <= 15 ? 2 : 3);
  if (u % 4 === 0 && u <= 10) insUS.run(u, 2); // часть игроков основы играет и во втором дивизионе
  if (u === 13 || u === 17) insUS.run(u, 3);
}
const OPP = ['Tbilisi Wolves', 'Batumi Bears', 'Rustavi Steel', 'Kutaisi Kings', 'Ice Tigers', 'Gori Hawks'];
let gameNo = 0;

// события: прошлые и будущие тренировки по вт/чт 21:30 (Тбилиси = UTC+4), игры по воскресеньям
const at = (daysFromNow: number, hhmmUtc: [number, number]) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hhmmUtc[0], hhmmUtc[1], 0, 0);
  return d.toISOString();
};
const insE = db.prepare('INSERT INTO events(type, title, starts_at, location, capacity, created_by) VALUES(?,?,?,?,?,2)');
const insS = db.prepare('INSERT OR IGNORE INTO signups(event_id, user_id, status, created_at) VALUES(?,?,?,?)');
const rnd = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
};
const r = rnd(42);
for (let d = -45; d <= 14; d++) {
  const date = new Date(Date.now() + d * 864e5);
  const dow = date.getUTCDay();
  let id: number | null = null;
  if (dow === 2 || dow === 4) {
    id = Number(insE.run('training', null, at(d, [17, 30]), 'Ледовая арена «Олимп»', 22).lastInsertRowid);
  } else if (dow === 0 || dow === 6) {
    // игры: у каждого состава свои
    const squad = (gameNo % 3) + 1;
    id = Number(insE.run('game', `vs ${OPP[gameNo % OPP.length]}`, at(d, [dow === 0 ? 15 : 11, 0]), 'Ice Palace', null).lastInsertRowid);
    db.prepare('INSERT INTO event_squads(event_id, squad_id) VALUES(?,?)').run(id, squad);
    if (d < 0) db.prepare('UPDATE events SET score_us=?, score_them=? WHERE id=?').run(Math.floor(r() * 7), Math.floor(r() * 6), id);
    gameNo++;
  }
  if (!id) continue;
  const fill = d < 0 ? 0.7 : d < 5 ? 0.45 : 0.1;
  const sq = (db.prepare('SELECT squad_id FROM event_squads WHERE event_id=?').all(id) as { squad_id: number }[]).map((x) => x.squad_id);
  for (let u = 1; u <= 20; u++) {
    if (sq.length && !db.prepare(`SELECT 1 FROM user_squads WHERE user_id=? AND squad_id IN (${sq.join(',')})`).get(u)) continue;
    const x = r();
    if (x < fill) insS.run(id, u, 'in', at(d - 2, [8, Math.floor(r() * 59)]));
    else if (x < fill + 0.1) insS.run(id, u, 'out', at(d - 2, [9, 0]));
  }
}

// финансы: прошлый месяц закрыт, текущий — идёт сбор
const now = new Date();
const ym = (offset: number) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return d.toISOString().slice(0, 7);
};
const insP = db.prepare('INSERT INTO periods(month, budget, partial_ratio, donation_amount, due_date) VALUES(?,?,?,?,?)');
const plans = ['full', 'partial', 'donation'];
const prev = Number(insP.run(ym(-1), 5800, 0.7, 100, `${ym(-1)}-05`).lastInsertRowid);
ensureDues(prev);
for (let u = 1; u <= 20; u++) {
  const plan = u % 9 === 0 ? 'donation' : u % 2 ? 'full' : 'partial';
  db.prepare('UPDATE dues SET plan=?, status=? WHERE period_id=? AND user_id=?').run(plan, u === 7 ? 'unpaid' : 'paid', prev, u);
}
lockPeriod(db.prepare('SELECT * FROM periods WHERE id=?').get(prev) as never);

const cur = Number(insP.run(ym(0), 6000, 0.7, 100, `${ym(0)}-05`).lastInsertRowid);
ensureDues(cur);
for (let u = 1; u <= 20; u++) {
  if (u === 4 || u === 12) continue; // ещё не выбрали
  db.prepare('UPDATE dues SET plan=? WHERE period_id=? AND user_id=?').run(plans[u % 9 === 0 ? 2 : u % 2], cur, u);
}

// счета — ЗАГЛУШКИ, заменить на реальные в «Админ → Счета»
const insA = db.prepare('INSERT INTO accounts(bank, holder, iban, purpose, note, sort) VALUES(?,?,?,?,?,?)');
insA.run('TBC', 'Казначей команды', 'GE00TB0000000000000001', 'dues', 'Демо-счёт, замените', 1);
insA.run('BOG', 'Казначей команды', 'GE00BG0000000000000002', 'dues', 'Демо-счёт, замените', 2);
insA.run('TBC', 'Сервис-менеджер', 'GE00TB0000000000000003', 'sharpening', 'Демо-счёт, замените', 3);

// заточка: заявка на проверке и долг, записанный точильщиком
db.prepare(`INSERT INTO sharpenings(user_id, note, price, status, payment) VALUES(5, 'Радиус 1/2, привезу в четверг', 20, 'new', 'pending')`).run();
db.prepare(`INSERT INTO sharpenings(user_id, note, price, status, payment, updated_at) VALUES(7, 'Наточил перед игрой', 20, 'done', 'unpaid', ?)`).run(new Date().toISOString());

console.log('✅ Демо-данные созданы. Пользователи: 1 админ, 2 тренер, 3 сервис, 4–20 игроки, 21 ждёт доступа.');
