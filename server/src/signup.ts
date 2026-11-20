import { db, nowIso, type UserRow } from './db.ts';

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
}

export const getEvent = (id: number) => db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;

/** Записать / отписать. Возвращает текст ошибки или null. Общая логика для приложения и кнопок в Telegram. */
export function setSignup(e: EventRow, user: UserRow, status: 'in' | 'out' | null): string | null {
  if (user.status !== 'active') return 'Доступ ещё не открыт — дождись одобрения админа';
  if (e.cancelled) return 'Событие отменено';
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
  return null;
}

export function goingCount(eventId: number) {
  return (db.prepare(`SELECT COUNT(*) c FROM signups WHERE event_id=? AND status='in'`).get(eventId) as { c: number }).c;
}
