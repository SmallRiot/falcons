import type { FastifyInstance } from 'fastify';
import { requireRole } from '../auth.ts';
import { db, publicUser, type UserRow } from '../db.ts';
import { arcadePlayers, withStore } from '../prizes.ts';

/**
 * «Люди» для тренера и админа: все, кто ходит на лёд (игроки и гости), с тегами составов,
 * очками, ачивками и посещаемостью. В каждого можно провалиться — история тренировок и игр.
 */
export default async function peopleRoutes(app: FastifyInstance) {
  const staff = { preHandler: requireRole('coach', 'admin') };
  const DAY = 864e5;

  const wallet = (ids: Set<number>, id: number) => {
    if (!ids.has(id)) return { balance: 0, goals: 0, lastPlayed: null as string | null };
    try {
      const st = withStore(id, (s) => s.stats());
      return { balance: st.balance, goals: st.goals, lastPlayed: st.lastPlayed };
    } catch {
      return { balance: 0, goals: 0, lastPlayed: null };
    }
  };
  const achievements = (id: number) =>
    db
      .prepare(
        `SELECT item, title, expires_at FROM prize_orders WHERE user_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?)
         AND kind IN ('cosmetic', 'troll') ORDER BY id DESC`,
      )
      .all(id, new Date().toISOString()) as { item: string; title: string; expires_at: string | null }[];

  /** Был на событии: отметка тренера, а если её нет — записался «иду». */
  const ATTENDED = `COALESCE(s.attended, s.status = 'in') = 1`;

  app.get('/api/people', staff, () => {
    const now = new Date().toISOString();
    const since30 = new Date(Date.now() - 30 * DAY).toISOString();
    const users = db
      .prepare(`SELECT * FROM users WHERE status IN ('active', 'guest') ORDER BY first_name, last_name`)
      .all() as unknown as UserRow[];
    const counts = new Map(
      (
        db
          .prepare(
            `SELECT s.user_id,
                    SUM(CASE WHEN e.type = 'training' AND e.starts_at >= ? THEN 1 ELSE 0 END) t30,
                    SUM(CASE WHEN e.type = 'game' AND e.starts_at >= ? THEN 1 ELSE 0 END) g30,
                    COUNT(*) total, MAX(e.starts_at) last
             FROM signups s JOIN events e ON e.id = s.event_id
             WHERE e.cancelled = 0 AND e.starts_at < ? AND ${ATTENDED} GROUP BY s.user_id`,
          )
          .all(since30, since30, now) as { user_id: number; t30: number; g30: number; total: number; last: string }[]
      ).map((r) => [r.user_id, r]),
    );
    const trainings30 = (db.prepare(`SELECT COUNT(*) c FROM events WHERE cancelled = 0 AND type = 'training' AND starts_at BETWEEN ? AND ?`).get(since30, now) as { c: number }).c;
    const wallets = new Set(arcadePlayers());
    return {
      trainings30,
      people: users.map((u) => {
        const c = counts.get(u.id);
        const w = wallet(wallets, u.id);
        return {
          user: publicUser(u),
          roles: u.roles ? u.roles.split(',').filter(Boolean) : [],
          noTelegram: u.status === 'guest',
          balance: w.balance,
          achievements: achievements(u.id).length,
          trainings30: c?.t30 ?? 0,
          games30: c?.g30 ?? 0,
          total: c?.total ?? 0,
          lastOnIce: c?.last ?? null,
        };
      }),
    };
  });

  app.get<{ Params: { id: string } }>('/api/people/:id', staff, (req, reply) => {
    const u = db.prepare(`SELECT * FROM users WHERE id = ? AND status IN ('active', 'guest')`).get(Number(req.params.id)) as UserRow | undefined;
    if (!u) return reply.code(404).send({ error: 'Человек не найден' });
    const now = new Date().toISOString();
    const stat = (days: number | null) => {
      const since = days ? new Date(Date.now() - days * DAY).toISOString() : '0000';
      const r = db
        .prepare(
          `SELECT SUM(CASE WHEN e.type = 'training' THEN 1 ELSE 0 END) t, SUM(CASE WHEN e.type = 'game' THEN 1 ELSE 0 END) g
           FROM signups s JOIN events e ON e.id = s.event_id WHERE s.user_id = ? AND e.cancelled = 0 AND e.starts_at BETWEEN ? AND ? AND ${ATTENDED}`,
        )
        .get(u.id, since, now) as { t: number | null; g: number | null };
      const all = (db.prepare(`SELECT COUNT(*) c FROM events WHERE cancelled = 0 AND type = 'training' AND starts_at BETWEEN ? AND ?`).get(since, now) as { c: number }).c;
      return { trainings: r.t ?? 0, games: r.g ?? 0, ofTrainings: all };
    };
    const history = db
      .prepare(
        `SELECT e.id, e.type, e.title, e.starts_at, e.location, s.status, s.attended, e.score_us, e.score_them,
                (SELECT l.line FROM lineups l WHERE l.event_id = e.id AND l.user_id = s.user_id) line
         FROM signups s JOIN events e ON e.id = s.event_id
         WHERE s.user_id = ? AND e.cancelled = 0 ORDER BY e.starts_at DESC LIMIT 60`,
      )
      .all(u.id) as { id: number; type: string; title: string | null; starts_at: string; location: string | null; status: string; attended: number | null; line: number | null }[];
    const w = wallet(new Set(arcadePlayers()), u.id);
    return {
      user: { ...publicUser(u), club: u.club ?? null },
      roles: u.roles ? u.roles.split(',').filter(Boolean) : [],
      noTelegram: u.status === 'guest',
      since: u.created_at,
      stats: { d30: stat(30), d90: stat(90), all: stat(null) },
      balance: w.balance,
      arcadeGoals: w.goals,
      lastPlayed: w.lastPlayed,
      achievements: achievements(u.id),
      upcoming: history.filter((h) => h.starts_at >= now).reverse(),
      history: history.filter((h) => h.starts_at < now),
    };
  });

  /** Команда гостя (из какого он клуба) — тег в пятёрках. Пусто — просто «Гость». */
  app.patch<{ Params: { id: string }; Body: { club: string } }>(
    '/api/people/:id/club',
    { ...staff, schema: { body: { type: 'object', required: ['club'], properties: { club: { type: 'string', maxLength: 40 } } } } },
    (req, reply) => {
      const r = db.prepare(`UPDATE users SET club = ? WHERE id = ? AND status IN ('active', 'guest')`).run(req.body.club.trim() || null, Number(req.params.id));
      if (!r.changes) return reply.code(404).send({ error: 'Человек не найден' });
      return { ok: true };
    },
  );
}
