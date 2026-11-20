import { db, nowIso, type UserRow } from './db.ts';
import { canSeeEvent } from './squads.ts';

export interface EventRow {
  id: number;
  type: 'training' | 'game';
  title: string | null;
  starts_at: string;
  duration_min: number;
  location: string | null;
  capacity: number | null;
  notes: string | null;
  cancelled: number;
  lineup_published: number;
  tg_message_id: number | null;
  score_us: number | null;
  score_them: number | null;
}

export const getEvent = (id: number) => db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;

/** Записать / отписать. Возвращает текст ошибки или null. Общая логика для приложения и кнопок в Telegram. */
export function setSignup(e: EventRow, user: UserRow, status: 'in' | 'out' | null): string | null {
  if (user.status !== 'active') return 'Доступ ещё не открыт — дождись одобрения админа';
  if (e.cancelled) return 'Событие отменено';
  if (!canSeeEvent(user, e.id)) return 'Это событие другого состава';
  if (Date.parse(e.starts_at) < Date.now()) return 'Событие уже началось';
  if (status === 'in' && user.signup_blocked) return 'Запись закрыта — сначала закрой долг по взносам';
  if (!status) {
    db.prepare('DELETE FROM signups WHERE event_id = ? AND user_id = ?').run(e.id, user.id);
  } else {
    const prev = db.prepare('SELECT status FROM signups WHERE event_id=? AND user_id=?').get(e.id, user.id) as
      | { status: string }
      | undefined;
    if (prev?.status !== status)
      // при смене статуса время записи обновляется — для очереди резерва
      db.prepare(
        `INSERT INTO signups(event_id, user_id, status, created_at) VALUES(?,?,?,?)
         ON CONFLICT(event_id,user_id) DO UPDATE SET status=excluded.status, created_at=excluded.created_at`,
      ).run(e.id, user.id, status, nowIso());
  }
  if (status !== 'in') db.prepare('DELETE FROM lineups WHERE event_id = ? AND user_id = ?').run(e.id, user.id);
  syncGuestFee(e, user, status);
  return null;
}

export const isGuestRole = (u: Pick<UserRow, 'roles'>) => u.roles.split(',').includes('guest');

/** Гость записался — появляется оплата за выход (если цена не 0); передумал — неоплаченную убираем. */
export function syncGuestFee(e: EventRow, user: UserRow, status: 'in' | 'out' | null) {
  if (status === 'in') {
    if (!isGuestRole(user) || !(Number(user.guest_price) > 0)) return;
    db.prepare('INSERT OR IGNORE INTO guest_fees(event_id, user_id, amount) VALUES(?,?,?)').run(e.id, user.id, Number(user.guest_price));
  } else {
    db.prepare(`DELETE FROM guest_fees WHERE event_id = ? AND user_id = ? AND status = 'unpaid'`).run(e.id, user.id);
  }
}

export type GuestFee = { id: number; event_id: number; user_id: number; amount: number; status: 'unpaid' | 'pending' | 'paid'; proof: string | null; comment: string | null; created_at: string; updated_at: string | null };
export const myFee = (eventId: number, userId: number) =>
  (db.prepare('SELECT * FROM guest_fees WHERE event_id = ? AND user_id = ?').get(eventId, userId) as GuestFee | undefined) ?? null;
/** Неоплаченные выходы гостя (для окна долга и напоминаний). */
export const guestDebts = (userId: number) =>
  db
    .prepare(
      `SELECT f.id, f.event_id, f.amount, f.status, e.starts_at, e.type, e.title FROM guest_fees f JOIN events e ON e.id = f.event_id
       WHERE f.user_id = ? AND f.status = 'unpaid' AND e.cancelled = 0 ORDER BY e.starts_at`,
    )
    .all(userId) as { id: number; event_id: number; amount: number; status: string; starts_at: string; type: string; title: string | null }[];

export function goingCount(eventId: number) {
  return (db.prepare(`SELECT COUNT(*) c FROM signups s JOIN users u ON u.id = s.user_id WHERE s.event_id=? AND s.status='in' AND u.position IS NOT 'G'`).get(eventId) as { c: number }).c;
}
