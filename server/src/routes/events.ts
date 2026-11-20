import type { FastifyInstance } from 'fastify';
import { requireActive, requireRole } from '../auth.ts';
import { ANNOUNCE_DAYS, DEFAULT_LOCATION } from '../config.ts';
import { db, hasRole, nowIso, publicUser, type UserRow } from '../db.ts';
import { notifyEventCreated, notifyLineupPersonal, notifyLineupPublished, refreshEventPost, renderFor } from '../telegram.ts';
import { setSignup, type EventRow } from '../signup.ts';
import { canSeeEvent, eventSquadIds, setEventSquads, squadsMap, VISIBLE_SQL } from '../squads.ts';

type EventBody = Partial<EventRow> & { notify?: boolean; squad_ids?: number[] };


const SLOTS = ['LW', 'C', 'RW', 'LD', 'RD'];
const GOALIE_SLOTS = ['G1', 'G2'];

function participants(eventId: number) {
  return db
    .prepare(
      `SELECT u.*, s.status AS signup_status, s.created_at AS signed_at
       FROM signups s JOIN users u ON u.id = s.user_id
       WHERE s.event_id = ? ORDER BY s.created_at`,
    )
    .all(eventId) as unknown as (UserRow & { signup_status: string; signed_at: string })[];
}

function summarize(e: EventRow, userId: number) {
  const stats = db
    .prepare(`SELECT status, COUNT(*) c FROM signups WHERE event_id = ? GROUP BY status`)
    .all(e.id) as { status: string; c: number }[];
  const going = stats.find((s) => s.status === 'in')?.c ?? 0;
  const out = stats.find((s) => s.status === 'out')?.c ?? 0;
  const mine = db.prepare('SELECT status, created_at FROM signups WHERE event_id = ? AND user_id = ?').get(e.id, userId) as
    | { status: string; created_at: string }
    | undefined;
  let myReserve = false;
  if (mine?.status === 'in' && e.capacity) {
    const before = (
      db
        .prepare(`SELECT COUNT(*) c FROM signups WHERE event_id = ? AND status='in' AND created_at < ?`)
        .get(e.id, mine.created_at) as { c: number }
    ).c;
    myReserve = before >= e.capacity;
  }
  const avatars = db
    .prepare(
      `SELECT u.id, u.first_name, u.last_name, u.photo_url FROM signups s JOIN users u ON u.id=s.user_id
       WHERE s.event_id=? AND s.status='in' ORDER BY s.created_at LIMIT 5`,
    )
    .all(e.id);
  const sq = squadsMap();
  const squads = eventSquadIds(e.id)
    .map((id) => sq.get(id))
    .filter(Boolean)
    .map((s) => ({ id: s!.id, short: s!.short, name: s!.name, color: s!.color }));
  return { ...e, squads, cancelled: !!e.cancelled, lineup_published: !!e.lineup_published, going, out, my: mine?.status ?? null, myReserve, avatars };
}

export default async function eventRoutes(app: FastifyInstance) {
  /** По умолчанию — только события моих составов; тренер и админ могут попросить все (?all=1). */
  app.get<{ Querystring: { scope?: string; all?: string } }>('/api/events', { preHandler: requireActive }, async (req) => {
    const past = req.query.scope === 'past';
    const all = req.query.all === '1' && hasRole(req.user, 'coach', 'admin');
    // событие считается «текущим» ещё 3 часа после начала
    const edge = new Date(Date.now() - 3 * 3600e3).toISOString();
    const rows = db
      .prepare(
        // отменённые в «Предстоящих» не показываем никому — только в прошедших, для истории
        `SELECT * FROM events e WHERE starts_at ${past ? '<' : '>='} ? ${past ? '' : 'AND cancelled = 0'} ${all ? '' : `AND ${VISIBLE_SQL}`}
         ORDER BY starts_at ${past ? 'DESC' : 'ASC'} LIMIT 80`,
      )
      .all(...(all ? [edge] : [edge, req.user.id])) as unknown as EventRow[];
    return rows.map((e) => summarize(e, req.user.id));
  });

  app.get<{ Params: { id: string } }>('/api/events/:id', { preHandler: requireActive }, async (req, reply) => {
    const e = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(req.params.id)) as EventRow | undefined;
    if (!e || !canSeeEvent(req.user, e.id)) return reply.code(404).send({ error: 'Событие не найдено' });
    const ps = participants(e.id);
    const going = ps.filter((p) => p.signup_status === 'in');
    const cap = e.capacity ?? Infinity;
    const canEdit = hasRole(req.user, 'coach', 'admin');
    const lineup =
      e.lineup_published || canEdit
        ? (db.prepare('SELECT user_id, team, line, slot FROM lineups WHERE event_id = ?').all(e.id) as {
            user_id: number;
            team: string;
            line: number;
            slot: string;
          }[])
        : [];
    return {
      ...summarize(e, req.user.id),
      canEdit,
      players: going.map((p, i) => ({ ...publicUser(p), reserve: i >= cap })),
      notGoing: ps.filter((p) => p.signup_status === 'out').map(publicUser),
      lineup,
    };
  });

  /**
   * Создание: одно событие (starts_at) или серия (starts_at_list — выбранные в календаре дни).
   * В чат сразу уходят только события ближайших ANNOUNCE_DAYS дней, остальные бот запостит сам,
   * когда до них останется неделя, — чтобы серия на месяц вперёд не завалила чат.
   */
  app.post<{ Body: EventBody & { starts_at_list?: string[] } }>(
    '/api/events',
    { preHandler: requireRole('coach', 'admin') },
    async (req, reply) => {
      const b = req.body ?? {};
      const list = (Array.isArray(b.starts_at_list) && b.starts_at_list.length ? b.starts_at_list : [b.starts_at]).filter(Boolean) as string[];
      if (!list.length || list.some((x) => isNaN(Date.parse(x)))) return reply.code(400).send({ error: 'Укажите дату и время' });
      if (list.length > 60) return reply.code(400).send({ error: 'Не больше 60 событий за раз' });
      const type = b.type === 'game' ? 'game' : 'training';
      const ins = db.prepare(
        `INSERT INTO events(type, title, starts_at, duration_min, location, capacity, notes, created_by)
         VALUES(?,?,?,?,?,?,?,?)`,
      );
      const created: EventRow[] = [];
      for (const when of [...new Set(list)].sort()) {
        const r = ins.run(
          type,
          b.title?.trim() || null,
          new Date(when).toISOString(),
          Number(b.duration_min) || 90,
          b.location?.trim() || DEFAULT_LOCATION,
          b.capacity ? Number(b.capacity) : null,
          b.notes?.trim() || null,
          req.user.id,
        );
        const e = db.prepare('SELECT * FROM events WHERE id = ?').get(r.lastInsertRowid) as unknown as EventRow;
        // тренировки общие для всего клуба, составы указываются только у игр
        setEventSquads(e.id, type === 'game' ? (b.squad_ids ?? []).map(Number) : []);
        created.push(e);
      }
      let announced = 0;
      for (const e of created) {
        if (b.notify === false) continue;
        if (Date.parse(e.starts_at) - Date.now() <= ANNOUNCE_DAYS * 864e5) {
          void notifyEventCreated(e);
          announced++;
        } else db.prepare('UPDATE events SET announce_pending = 1 WHERE id = ?').run(e.id);
      }
      return { ...created[0], ids: created.map((e) => e.id), count: created.length, announced };
    },
  );

  app.patch<{ Params: { id: string }; Body: EventBody }>(
    '/api/events/:id',
    { preHandler: requireRole('coach', 'admin') },
    async (req, reply) => {
      const id = Number(req.params.id);
      const e = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
      if (!e) return reply.code(404).send({ error: 'Событие не найдено' });
      const b = { ...e, ...req.body };
      db.prepare(
        `UPDATE events SET type=?, title=?, starts_at=?, duration_min=?, location=?, capacity=?, notes=?, cancelled=?,
         score_us=?, score_them=? WHERE id=?`,
      ).run(
        b.type === 'game' ? 'game' : 'training',
        b.title || null,
        new Date(b.starts_at).toISOString(),
        Number(b.duration_min) || 90,
        b.location || null,
        b.capacity ? Number(b.capacity) : null,
        b.notes || null,
        b.cancelled ? 1 : 0,
        b.score_us == null || (b.score_us as unknown) === '' ? null : Number(b.score_us),
        b.score_them == null || (b.score_them as unknown) === '' ? null : Number(b.score_them),
        id,
      );
      if (b.type !== 'game') setEventSquads(id, []);
      else if (req.body.squad_ids) setEventSquads(id, req.body.squad_ids.map(Number));
      refreshEventPost(id);
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string }; Body: { status: 'in' | 'out' | null } }>(
    '/api/events/:id/signup',
    { preHandler: requireActive },
    async (req, reply) => {
      const id = Number(req.params.id);
      const e = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
      if (!e) return reply.code(404).send({ error: 'Событие не найдено' });
      const err = setSignup(e, req.user, req.body?.status ?? null);
      if (err) return reply.code(400).send({ error: err });
      refreshEventPost(id);
      return summarize(db.prepare('SELECT * FROM events WHERE id = ?').get(id) as unknown as EventRow, req.user.id);
    },
  );

  /** Картинка пятёрок (как уйдёт в чат) — для предпросмотра в консоли. */
  app.get<{ Params: { id: string } }>('/api/events/:id/lineup.png', { preHandler: requireRole('coach', 'admin') }, async (req, reply) => {
    const e = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(req.params.id)) as EventRow | undefined;
    if (!e) return reply.code(404).send({ error: 'Событие не найдено' });
    reply.header('content-type', 'image/png').header('cache-control', 'no-store');
    return reply.send(renderFor(e));
  });

  app.put<{
    Params: { id: string };
    Body: { items: { user_id: number; team?: string; line: number; slot: string }[]; publish?: boolean };
  }>('/api/events/:id/lineup', { preHandler: requireRole('coach', 'admin') }, async (req, reply) => {
    const id = Number(req.params.id);
    const e = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
    if (!e) return reply.code(404).send({ error: 'Событие не найдено' });
    const items = (req.body?.items ?? [])
      .map((i) => ({ ...i, team: i.team === 'dark' || i.team === 'light' ? i.team : '' }))
      .filter(
        (i) =>
          (i.line === 0 && GOALIE_SLOTS.includes(i.slot)) || (i.line >= 1 && i.line <= 4 && SLOTS.includes(i.slot)),
      );
    const seen = new Set<string>();
    const users = new Set<number>();
    for (const i of items) {
      const k = `${i.team}:${i.line}:${i.slot}`;
      if (seen.has(k) || users.has(i.user_id)) return reply.code(400).send({ error: 'Игрок или позиция повторяются' });
      seen.add(k);
      users.add(i.user_id);
    }
    // что было опубликовано раньше — чтобы при правке писать только тем, у кого что-то поменялось
    const before = e.lineup_published
      ? new Map(
          (db.prepare('SELECT user_id, team, line FROM lineups WHERE event_id = ?').all(id) as { user_id: number; team: string; line: number }[]).map(
            (r) => [r.user_id, `${r.team}:${r.line}`],
          ),
        )
      : new Map<number, string>();
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM lineups WHERE event_id = ?').run(id);
      const ins = db.prepare('INSERT INTO lineups(event_id, user_id, team, line, slot) VALUES(?,?,?,?,?)');
      for (const i of items) ins.run(id, i.user_id, i.team, i.line, i.slot);
      if (req.body.publish) db.prepare('UPDATE events SET lineup_published = 1 WHERE id = ?').run(id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    if (req.body.publish) {
      if (!e.lineup_published) void notifyLineupPublished(e);
      const changed = items.filter((i) => before.get(i.user_id) !== `${i.team}:${i.line}`);
      void notifyLineupPersonal(e, changed);
      return { ok: true, notified: changed.length };
    }
    return { ok: true, notified: 0 };
  });
}
