import type { FastifyInstance } from 'fastify';
import { requireActive } from '../auth.ts';
import { db, hasRole, publicUser, rolesOf } from '../db.ts';
import { debtsOf } from '../finance.ts';
import { sharpeningDebts } from '../reminders.ts';
import { allSquads, squadIdsOf } from '../squads.ts';

/** «Был»: отметка тренера, а если её нет — записался «иду». */
export const PRESENT = `COALESCE(s.attended, s.status = 'in') = 1`;

export default async function meRoutes(app: FastifyInstance) {
  app.get('/api/me', async (req) => {
    const u = req.user;
    const base = {
      user: { ...publicUser(u), roles: rolesOf(u), status: u.status, signup_blocked: !!u.signup_blocked, squads: squadIdsOf(u.id) },
      squads: allSquads(),
    };
    if (u.status !== 'active') return base;

    const badges: Record<string, number> = {};
    if (hasRole(u, 'admin')) {
      badges.pendingUsers = (db.prepare(`SELECT COUNT(*) c FROM users WHERE status='pending'`).get() as { c: number }).c;
      badges.proofs = (db.prepare(`SELECT COUNT(*) c FROM dues WHERE status='pending'`).get() as { c: number }).c;
    }
    if (hasRole(u, 'service', 'admin')) {
      badges.sharpenings = (
        db.prepare(`SELECT COUNT(*) c FROM sharpenings WHERE status IN ('new','accepted')`).get() as { c: number }
      ).c;
    }
    badges.unread = (db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0').get(u.id) as { c: number }).c;
    const sharp = sharpeningDebts(u.id)[0];
    return { ...base, debts: debtsOf(u.id), sharpeningDebt: sharp ? { count: sharp.n, total: sharp.total } : null, badges };
  });

  app.get('/api/notifications', { preHandler: requireActive }, async (req) =>
    db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id),
  );
  app.post('/api/notifications/read', { preHandler: requireActive }, async (req) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(req.user.id);
    return { ok: true };
  });

  app.patch<{ Body: { number?: number | null; position?: string | null; first_name?: string; last_name?: string | null } }>(
    '/api/me',
    { preHandler: requireActive },
    async (req) => {
      const b = req.body ?? {};
      const pos = b.position && ['F', 'D', 'G'].includes(b.position) ? b.position : null;
      const num = b.number == null || b.number === ('' as unknown) ? null : Math.max(0, Math.min(99, Number(b.number)));
      db.prepare(
        `UPDATE users SET number = ?, position = ?, first_name = COALESCE(NULLIF(?, ''), first_name), last_name = ? WHERE id = ?`,
      ).run(num, pos, b.first_name?.trim() ?? '', b.last_name?.trim() || null, req.user.id);
      return { ok: true };
    },
  );

  app.get('/api/me/stats', { preHandler: requireActive }, async (req) => {
    const uid = req.user.id;
    const now = new Date().toISOString();
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

    const count = (sql: string, ...p: (string | number)[]) => (db.prepare(sql).get(...p) as { c: number }).c;
    const attended = (type: string, from?: string) =>
      count(
        `SELECT COUNT(*) c FROM signups s JOIN events e ON e.id = s.event_id
         WHERE s.user_id = ? AND ${PRESENT} AND e.cancelled = 0 AND e.type = ? AND e.starts_at < ? ${from ? 'AND e.starts_at >= ?' : ''}`,
        ...([uid, type, now, ...(from ? [from] : [])] as (string | number)[]),
      );
    const held30 = count(
      `SELECT COUNT(*) c FROM events WHERE type='training' AND cancelled=0 AND starts_at < ? AND starts_at >= ?`,
      now,
      since30,
    );
    const att30 = attended('training', since30);

    // серия подряд посещённых тренировок
    const recent = db
      .prepare(
        `SELECT e.id, (SELECT CASE WHEN ${PRESENT} THEN 'in' ELSE 'out' END FROM signups s WHERE s.event_id=e.id AND s.user_id=?) st
         FROM events e WHERE e.type='training' AND e.cancelled=0 AND e.starts_at < ? ORDER BY e.starts_at DESC LIMIT 50`,
      )
      .all(uid, now) as { st: string | null }[];
    let streak = 0;
    for (const r of recent) {
      if (r.st === 'in') streak++;
      else break;
    }

    const paid = (
      db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM dues WHERE user_id=? AND status='paid'`).get(uid) as { s: number }
    ).s;
    const lines = db
      .prepare(
        `SELECT l.line, COUNT(*) c FROM lineups l JOIN events e ON e.id=l.event_id
         WHERE l.user_id=? AND e.cancelled=0 GROUP BY l.line ORDER BY c DESC LIMIT 1`,
      )
      .get(uid) as { line: number; c: number } | undefined;

    // посещаемость по месяцам (последние 6)
    const byMonth = db
      .prepare(
        `SELECT substr(e.starts_at,1,7) m, COUNT(*) c FROM signups s JOIN events e ON e.id=s.event_id
         WHERE s.user_id=? AND ${PRESENT} AND e.cancelled=0 AND e.starts_at < ?
         GROUP BY m ORDER BY m DESC LIMIT 6`,
      )
      .all(uid, now) as { m: string; c: number }[];

    return {
      trainingsTotal: attended('training'),
      trainingsMonth: attended('training', monthStart),
      gamesTotal: attended('game'),
      gamesMonth: attended('game', monthStart),
      attendanceRate30: held30 ? Math.round((att30 / held30) * 100) : null,
      streak,
      paidTotal: paid,
      sharpenings: count(`SELECT COUNT(*) c FROM sharpenings WHERE user_id=? AND status='done'`, uid),
      favouriteLine: lines?.line ?? null,
      byMonth: byMonth.reverse(),
    };
  });
}
