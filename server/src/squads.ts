import { db, hasRole, type UserRow } from './db.ts';

export interface Squad {
  id: number;
  name: string;
  short: string;
  color: string;
  division: number | null;
  sort: number;
}

export const allSquads = () => db.prepare('SELECT * FROM squads ORDER BY sort, id').all() as unknown as Squad[];

export const squadIdsOf = (userId: number) =>
  (db.prepare('SELECT squad_id FROM user_squads WHERE user_id = ?').all(userId) as { squad_id: number }[]).map((r) => r.squad_id);

export const eventSquadIds = (eventId: number) =>
  (db.prepare('SELECT squad_id FROM event_squads WHERE event_id = ?').all(eventId) as { squad_id: number }[]).map((r) => r.squad_id);

export function setEventSquads(eventId: number, ids: number[]) {
  db.prepare('DELETE FROM event_squads WHERE event_id = ?').run(eventId);
  const ins = db.prepare('INSERT OR IGNORE INTO event_squads(event_id, squad_id) VALUES(?,?)');
  for (const id of ids) ins.run(eventId, id);
}

export function setUserSquads(userId: number, ids: number[]) {
  db.prepare('DELETE FROM user_squads WHERE user_id = ?').run(userId);
  const ins = db.prepare('INSERT OR IGNORE INTO user_squads(user_id, squad_id) VALUES(?,?)');
  for (const id of ids) ins.run(userId, id);
}

/** SQL-условие «событие видно пользователю»: общее для клуба или для одного из его составов. Параметр — user id. */
export const VISIBLE_SQL = `(NOT EXISTS (SELECT 1 FROM event_squads es WHERE es.event_id = e.id)
  OR EXISTS (SELECT 1 FROM event_squads es JOIN user_squads us ON us.squad_id = es.squad_id
             WHERE es.event_id = e.id AND us.user_id = ?))`;

export function canSeeEvent(user: Pick<UserRow, 'id' | 'roles'>, eventId: number) {
  if (hasRole(user, 'admin', 'coach')) return true;
  return !!db.prepare(`SELECT 1 FROM events e WHERE e.id = ? AND ${VISIBLE_SQL}`).get(eventId, user.id);
}

/**
 * Кто идёт на игру, видят только игроки её состава (и тренер с админом).
 * Игра без составов — для всего клуба: видят все, кто состоит хоть в одном составе. Тренировки видят все.
 */
export function canSeeRoster(user: Pick<UserRow, 'id' | 'roles'>, e: { id: number; type: string }) {
  if (e.type !== 'game' || hasRole(user, 'admin', 'coach')) return true;
  const sq = eventSquadIds(e.id);
  const mine = squadIdsOf(user.id);
  return sq.length ? sq.some((id) => mine.includes(id)) : mine.length > 0;
}

/** Кому адресовано событие (для напоминаний): активные игроки нужных составов. */
export function eventAudience(eventId: number) {
  return (
    db
      .prepare(
        `SELECT u.id FROM users u WHERE u.status = 'active' AND (
           NOT EXISTS (SELECT 1 FROM event_squads WHERE event_id = ?)
           OR u.id IN (SELECT us.user_id FROM user_squads us JOIN event_squads es ON es.squad_id = us.squad_id WHERE es.event_id = ?))`,
      )
      .all(eventId, eventId) as { id: number }[]
  ).map((r) => r.id);
}

export function squadsMap() {
  return new Map(allSquads().map((s) => [s.id, s]));
}
