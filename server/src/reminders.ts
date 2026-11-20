/**
 * Периодические напоминания («подпушивание»):
 *  - долг по взносам — раз в N часов (по умолчанию 60 ч ≈ 2,5 дня);
 *  - долг за заточку — так же;
 *  - не выбран вариант взноса в открытом месяце — так же;
 *  - не отметился на завтрашнюю тренировку/игру — один раз.
 * Не пишем ночью: только с 10:00 до 22:00 по Тбилиси.
 */
import { ANNOUNCE_DAYS, config } from './config.ts';

/** В тестовом режиме не заваливаем тестировщика: не больше N напоминаний за прогон. */
const TEST_CAP = 5;
import { db, getSetting, nowIso } from './db.ts';
import { debtsOf } from './finance.ts';
import { notifyEventCreated, notifyBirthdays, sendMessage, reminderDues, reminderPlan, reminderRsvp, reminderSharpening, reminderGuestFees, monthName } from './telegram.ts';
import { getEvent, type EventRow } from './signup.ts';
import { eventAudience } from './squads.ts';

const lastSent = db.prepare('SELECT sent_at FROM notify_log WHERE key = ?');
const markStmt = db.prepare(
  'INSERT INTO notify_log(key, sent_at) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET sent_at = excluded.sent_at',
);

export const markSent = (key: string) => markStmt.run(key, nowIso());

function isDue(key: string, everyHours: number) {
  const row = lastSent.get(key) as { sent_at: string } | undefined;
  return !row || Date.now() - Date.parse(row.sent_at) >= everyHours * 3600e3;
}

function quietHours() {
  const h = Number(new Intl.DateTimeFormat('en', { timeZone: config.tz, hour: 'numeric', hour12: false }).format(new Date()));
  return h < 10 || h >= 22;
}

export function sharpeningDebts(userId?: number) {
  return db
    .prepare(
      `SELECT user_id, COUNT(*) n, SUM(price) total FROM sharpenings
       WHERE payment = 'unpaid' AND status != 'rejected' ${userId ? 'AND user_id = ?' : ''} GROUP BY user_id`,
    )
    .all(...(userId ? [userId] : [])) as { user_id: number; n: number; total: number }[];
}

/** force — игнорировать тихие часы и интервал (кнопка «Напомнить сейчас» у админа). */
export async function runReminders(force = false) {
  if (!force && quietHours()) return 0;
  const every = force ? 0 : Number(getSetting('remind_every_hours', '60'));
  const active = db.prepare(`SELECT id, first_name FROM users WHERE status = 'active'`).all() as { id: number; first_name: string }[];
  let sent = 0;
  let skipped = 0;
  let delivered = 0;
  const budget = () => {
    if (!config.testChatId || delivered < TEST_CAP) return ++delivered > 0;
    skipped++;
    return false;
  };

  // 1. долги по взносам
  for (const u of active) {
    const debts = debtsOf(u.id);
    if (!debts.length) continue;
    const key = `debt:dues:${u.id}`;
    if (!isDue(key, every)) continue;
    const total = debts.reduce((s, d) => s + d.amount, 0);
    if (budget()) await reminderDues(u.id, u.first_name, debts);
    markSent(key);
    sent++;
  }

  // 2. долги за заточку
  for (const d of sharpeningDebts()) {
    const key = `debt:sharp:${d.user_id}`;
    if (!isDue(key, every)) continue;
    if (budget()) await reminderSharpening(d.user_id, d.total);
    markSent(key);
    sent++;
  }

  // 2б. гости: неоплаченные выходы на лёд
  const guestRows = db
    .prepare(
      `SELECT f.user_id, SUM(f.amount) total, COUNT(*) n FROM guest_fees f JOIN events e ON e.id = f.event_id
       WHERE f.status = 'unpaid' AND e.cancelled = 0 GROUP BY f.user_id`,
    )
    .all() as { user_id: number; total: number; n: number }[];
  for (const g of guestRows) {
    const key = `debt:fee:${g.user_id}`;
    if (!isDue(key, every)) continue;
    if (budget()) await reminderGuestFees(g.user_id, g.total, g.n);
    markSent(key);
    sent++;
  }

  // 3. не выбран вариант взноса
  const open = db.prepare('SELECT id, month FROM periods WHERE locked = 0').all() as { id: number; month: string }[];
  for (const p of open) {
    const undecided = db
      .prepare(
        `SELECT u.id FROM dues d JOIN users u ON u.id = d.user_id
         WHERE d.period_id = ? AND u.status = 'active' AND d.plan IS NULL AND d.custom_amount IS NULL`,
      )
      .all(p.id) as { id: number }[];
    for (const u of undecided) {
      const key = `plan:${p.id}:${u.id}`;
      if (!isDue(key, every)) continue;
      if (budget()) await reminderPlan(u.id, p.month);
      markSent(key);
      sent++;
    }
  }

  // 4. не отметился «иду / не иду»: в личку за 4 дня, за 2 дня и за 6 часов до начала
  // (в группу событие постится за неделю — см. runAnnouncements)
  const STAGES = [96, 48, 6];
  const soon = db
    .prepare(`SELECT id, type, starts_at FROM events WHERE cancelled = 0 AND starts_at > ? AND starts_at < ?`)
    .all(new Date(Date.now() + 1 * 3600e3).toISOString(), new Date(Date.now() + STAGES[0] * 3600e3).toISOString()) as {
    id: number;
    type: string;
    starts_at: string;
  }[];
  for (const e of soon) {
    const hoursLeft = (Date.parse(e.starts_at) - Date.now()) / 3600e3;
    // текущая ступень: самая маленькая, в которую уже попали (создали событие за сутки — придёт только «за 2 дня», потом «за 6 часов»)
    const stage = [...STAGES].reverse().find((h) => hoursLeft <= h);
    if (!stage) continue;
    const audience = new Set(eventAudience(e.id));
    const silent = db
      .prepare(
        `SELECT id FROM users WHERE status = 'active' AND signup_blocked = 0
         AND id NOT IN (SELECT user_id FROM signups WHERE event_id = ?)`,
      )
      .all(e.id)
      .filter((u) => audience.has((u as { id: number }).id)) as { id: number }[];
    for (const u of silent) {
      const key = `rsvp:${e.id}:${u.id}:${stage}`;
      if (!isDue(key, 24 * 365)) continue;
      if (budget()) await reminderRsvp(u.id, getEvent(e.id)!);
      // более ранние ступени, которые проскочили, тоже считаем отправленными
      for (const h of STAGES.filter((x) => x >= stage)) markSent(`rsvp:${e.id}:${u.id}:${h}`);
      sent++;
    }
  }
  if (skipped)
    void sendMessage(
      config.testChatId,
      `<i>🧪 тест · ещё ${skipped} напоминаний не отправлено, чтобы не спамить (лимит ${TEST_CAP} за раз). В проде уйдут все.</i>`,
    );
  if (sent) console.log(`[reminders] отправлено ${sent - skipped}${skipped ? `, пропущено в тесте ${skipped}` : ''}`);
  return sent - skipped;
}

/** Именинники сегодня по Тбилиси. 29 февраля в невисокосный год поздравляем 28-го. */
export function birthdaysToday(now = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: config.tz }).format(now); // YYYY-MM-DD
  const [y, md] = [Number(ymd.slice(0, 4)), ymd.slice(5)];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = md === '02-28' && !leap ? ['02-28', '02-29'] : [md];
  return {
    year: y,
    people: db
      .prepare(
        `SELECT id, first_name, last_name, number FROM users WHERE status = 'active' AND birth_date IS NOT NULL
         AND substr(birth_date, 6, 5) IN (${days.map(() => '?').join(',')}) ORDER BY first_name`,
      )
      .all(...days) as { id: number; first_name: string; last_name: string | null; number: number | null }[],
  };
}

/** Раз в день, после 10:00 по Тбилиси — открытка в чат. */
export async function runBirthdays() {
  if (quietHours()) return;
  const { year, people } = birthdaysToday();
  const fresh = people.filter((p) => isDue(`bday:${year}:${p.id}`, 24 * 365));
  if (!fresh.length) return;
  fresh.forEach((p) => markSent(`bday:${year}:${p.id}`));
  await notifyBirthdays(fresh);
  console.log(`[birthdays] поздравили: ${fresh.map((p) => p.first_name).join(', ')}`);
}

/** События из серии: когда до них остаётся неделя — пост в чат с кнопками «Иду / Не иду». */
export async function runAnnouncements() {
  if (quietHours()) return;
  const due = db
    .prepare(
      `SELECT * FROM events WHERE announce_pending = 1 AND cancelled = 0
       AND starts_at > ? AND starts_at <= ? ORDER BY starts_at`,
    )
    .all(new Date().toISOString(), new Date(Date.now() + ANNOUNCE_DAYS * 864e5).toISOString()) as unknown as EventRow[];
  for (const e of due) {
    db.prepare('UPDATE events SET announce_pending = 0 WHERE id = ?').run(e.id);
    await notifyEventCreated(e);
  }
  if (due.length) console.log(`[announce] запостили событий: ${due.length}`);
}

export function startReminders() {
  const tick = () => {
    runReminders().catch((e) => console.warn('[reminders] failed', e));
    runBirthdays().catch((e) => console.warn('[birthdays] failed', e));
    runAnnouncements().catch((e) => console.warn('[announce] failed', e));
    import('./aiBuddy.ts').then((m) => m.runDailyVkid()).catch((e) => console.warn('[ai] daily failed', e));
  };
  setTimeout(tick, 10_000);
  setInterval(tick, 15 * 60_000);
}
