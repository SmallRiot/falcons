import type { FastifyInstance } from 'fastify';
import { requireRole } from '../auth.ts';
import { db, nowIso, publicUser, rolesOf, type UserRow } from '../db.ts';
import { debtsOf } from '../finance.ts';
import { allSquads, squadIdsOf } from '../squads.ts';

/** Данные для десктопной консоли: таблицы посещаемости игр и тренировок. */
export default async function consoleRoutes(app: FastifyInstance) {
  const staff = { preHandler: requireRole('admin', 'coach') };

  app.get<{ Querystring: { type?: string; from?: string; to?: string } }>('/api/console/attendance', staff, async (req) => {
    const type = req.query.type === 'game' ? 'game' : 'training';
    const from = req.query.from ?? new Date(Date.now() - 31 * 864e5).toISOString();
    const to = req.query.to ?? new Date(Date.now() + 14 * 864e5).toISOString();
    const events = db
      .prepare(
        `SELECT e.id, e.type, e.title, e.starts_at, e.cancelled, e.score_us, e.score_them, e.capacity
         FROM events e WHERE e.type = ? AND e.starts_at >= ? AND e.starts_at < ? AND e.cancelled = 0 ORDER BY e.starts_at`,
      )
      .all(type, from, to) as { id: number }[];
    const ids = events.map((e) => e.id);
    const squadsOf = new Map<number, number[]>();
    for (const r of db.prepare('SELECT event_id, squad_id FROM event_squads').all() as { event_id: number; squad_id: number }[])
      squadsOf.set(r.event_id, [...(squadsOf.get(r.event_id) ?? []), r.squad_id]);
    const marks = ids.length
      ? (db
          .prepare(`SELECT event_id, user_id, status, attended FROM signups WHERE event_id IN (${ids.map(() => '?').join(',')})`)
          .all(...ids) as { event_id: number; user_id: number; status: string; attended: number | null }[])
      : [];
    const players = (db.prepare(`SELECT * FROM users WHERE status = 'active' ORDER BY last_name, first_name`).all() as unknown as UserRow[]).map(
      (u) => ({ ...publicUser(u), squads: squadIdsOf(u.id), roles: rolesOf(u) }),
    );
    return {
      squads: allSquads(),
      events: events.map((e) => ({ ...e, squads: squadsOf.get(e.id) ?? [] })),
      players,
      marks,
    };
  });

  /** Тренер отмечает факт: был / не был. null — убрать отметку (считаем по записи). */
  app.put<{ Body: { event_id: number; user_id: number; present: boolean | null } }>('/api/console/attendance', staff, async (req, reply) => {
    const { event_id, user_id, present } = req.body ?? ({} as never);
    if (!db.prepare('SELECT 1 FROM events WHERE id = ?').get(event_id)) return reply.code(404).send({ error: 'Событие не найдено' });
    const att = present === null ? null : present ? 1 : 0;
    db.prepare(
      `INSERT INTO signups(event_id, user_id, status, attended, created_at) VALUES(?,?,?,?,?)
       ON CONFLICT(event_id, user_id) DO UPDATE SET attended = excluded.attended`,
    ).run(event_id, user_id, present ? 'in' : 'out', att, nowIso());
    return { ok: true };
  });

  /** Таблица игроков для консоли. */
  app.get('/api/console/players', { preHandler: requireRole('admin', 'coach', 'service') }, async () => {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const now = nowIso();
    const att = new Map(
      (
        db
          .prepare(
            `SELECT s.user_id, SUM(CASE WHEN e.type='training' THEN 1 ELSE 0 END) t, SUM(CASE WHEN e.type='game' THEN 1 ELSE 0 END) g
             FROM signups s JOIN events e ON e.id = s.event_id
             WHERE COALESCE(s.attended, s.status = 'in') = 1 AND e.cancelled = 0 AND e.starts_at >= ? AND e.starts_at < ?
             GROUP BY s.user_id`,
          )
          .all(since, now) as { user_id: number; t: number; g: number }[]
      ).map((r) => [r.user_id, r]),
    );
    return (db.prepare(`SELECT * FROM users ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, last_name`).all() as unknown as UserRow[]).map((u) => ({
      ...publicUser(u),
      roles: rolesOf(u),
      status: u.status,
      signup_blocked: !!u.signup_blocked,
      squads: squadIdsOf(u.id),
      debt: debtsOf(u.id).reduce((s, d) => s + d.amount, 0),
      trainings30: att.get(u.id)?.t ?? 0,
      games30: att.get(u.id)?.g ?? 0,
    }));
  });
}
