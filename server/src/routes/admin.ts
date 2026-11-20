import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { requireActive, requireRole } from '../auth.ts';
import { uploadsDir } from '../config.ts';
import { db, hasRole, publicUser, rolesOf, type Role, type UserRow } from '../db.ts';
import { debtsOf } from '../finance.ts';
import { notifyAccessGranted, notifySignupBlocked } from '../telegram.ts';
import { removeAvatar, saveAvatar, updateProfile, type ProfileBody } from '../profile.ts';
import { allSquads, setUserSquads, squadIdsOf, type Squad } from '../squads.ts';

const ROLES: Role[] = ['admin', 'coach', 'service'];
const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.pdf': 'application/pdf',
};

export default async function adminRoutes(app: FastifyInstance) {
  const admin = { preHandler: requireRole('admin') };

  app.get('/api/admin/users', admin, async () => {
    const users = db
      .prepare(`SELECT * FROM users ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, first_name`)
      .all() as unknown as UserRow[];
    return users.map((u) => {
      const debts = debtsOf(u.id);
      return {
        ...publicUser(u),
        roles: rolesOf(u),
        status: u.status,
        signup_blocked: !!u.signup_blocked,
        squads: squadIdsOf(u.id),
        created_at: u.created_at,
        debt: debts.reduce((s, d) => s + d.amount, 0),
      };
    });
  });

  app.patch<{ Params: { id: string }; Body: ProfileBody & { status?: UserRow['status']; roles?: Role[]; signup_blocked?: boolean; squads?: number[] } }>(
    '/api/admin/users/:id',
    admin,
    async (req, reply) => {
      const id = Number(req.params.id);
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
      if (!u) return reply.code(404).send({ error: 'Пользователь не найден' });
      const b = req.body ?? {};
      if (id === req.user.id && (b.status && b.status !== 'active' || (b.roles && !b.roles.includes('admin'))))
        return reply.code(400).send({ error: 'Нельзя снять админку или доступ с самого себя' });
      const perr = updateProfile(u, b);
      if (perr) return reply.code(400).send({ error: perr });
      const status = b.status && ['pending', 'active', 'rejected'].includes(b.status) ? b.status : u.status;
      const roles = b.roles ? b.roles.filter((r) => ROLES.includes(r)).join(',') : u.roles;
      const blocked = b.signup_blocked !== undefined ? (b.signup_blocked ? 1 : 0) : u.signup_blocked;
      db.prepare('UPDATE users SET status=?, roles=?, signup_blocked=? WHERE id=?').run(status, roles, blocked, id);
      if (b.squads) setUserSquads(id, b.squads.map(Number));
      if (status === 'active' && u.status !== 'active') void notifyAccessGranted(id);
      if (blocked && !u.signup_blocked)
        void notifySignupBlocked(id);
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>('/api/admin/users/:id/photo', admin, async (req, reply) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) return reply.code(404).send({ error: 'Пользователь не найден' });
    return { photo_url: await saveAvatar(req, id) };
  });
  app.delete<{ Params: { id: string } }>('/api/admin/users/:id/photo', admin, async (req) => {
    removeAvatar(Number(req.params.id));
    return { ok: true };
  });

  /** Отдаём скрины только админу, владельцу и (для заточки) сервис-менеджеру. */
  app.get<{ Params: { name: string } }>('/api/files/:name', { preHandler: requireActive }, async (req, reply) => {
    const name = path.basename(req.params.name);
    const file = path.join(uploadsDir, name);
    if (!existsSync(file)) return reply.code(404).send({ error: 'Файл не найден' });
    const u = req.user;
    let allowed = hasRole(u, 'admin');
    if (!allowed) {
      const due = db.prepare('SELECT user_id FROM dues WHERE proof = ?').get(name) as { user_id: number } | undefined;
      const sh = db.prepare('SELECT user_id FROM sharpenings WHERE proof = ?').get(name) as { user_id: number } | undefined;
      allowed = due?.user_id === u.id || sh?.user_id === u.id || (!!sh && hasRole(u, 'service'));
    }
    if (!allowed) return reply.code(403).send({ error: 'Нет доступа' });
    reply.header('content-type', MIME[path.extname(name)] ?? 'application/octet-stream');
    reply.header('cache-control', 'private, max-age=86400');
    return reply.send(createReadStream(file));
  });

  /** Список игроков команды (для тренера и всех участников). */
  app.get('/api/roster', { preHandler: requireActive }, async () =>
    (db.prepare(`SELECT * FROM users WHERE status='active' ORDER BY first_name`).all() as unknown as UserRow[]).map(
      (u) => ({ ...publicUser(u), roles: rolesOf(u), squads: squadIdsOf(u.id) }),
    ),
  );

  /* ---------- составы ---------- */

  app.get('/api/squads', { preHandler: requireActive }, async () => allSquads());

  const cleanSquad = (b: Partial<Squad>) =>
    [b.name?.trim() ?? '', b.short?.trim().slice(0, 8) ?? '', /^#[0-9a-f]{6}$/i.test(b.color ?? '') ? b.color! : '#2b88cf', b.division ? Number(b.division) : null, Number(b.sort ?? 0)] as const;

  app.post<{ Body: Partial<Squad> }>('/api/admin/squads', admin, async (req, reply) => {
    const v = cleanSquad(req.body ?? {});
    if (!v[0] || !v[1]) return reply.code(400).send({ error: 'Название и короткая метка обязательны' });
    db.prepare('INSERT INTO squads(name, short, color, division, sort) VALUES(?,?,?,?,?)').run(...v);
    return { ok: true };
  });
  app.put<{ Params: { id: string }; Body: Partial<Squad> }>('/api/admin/squads/:id', admin, async (req, reply) => {
    const v = cleanSquad(req.body ?? {});
    if (!v[0] || !v[1]) return reply.code(400).send({ error: 'Название и короткая метка обязательны' });
    db.prepare('UPDATE squads SET name=?, short=?, color=?, division=?, sort=? WHERE id=?').run(...v, Number(req.params.id));
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>('/api/admin/squads/:id', admin, async (req) => {
    db.prepare('DELETE FROM squads WHERE id = ?').run(Number(req.params.id));
    return { ok: true };
  });
}
