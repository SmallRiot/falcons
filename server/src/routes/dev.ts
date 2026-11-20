import type { FastifyInstance } from 'fastify';
import { db, rolesOf, type UserRow } from '../db.ts';

/** Только при DEV_AUTH=1: список пользователей для переключателя в браузере. */
export default async function devRoutes(app: FastifyInstance) {
  app.get('/api/dev/users', async () =>
    (db.prepare("SELECT * FROM users WHERE status != 'guest' ORDER BY id").all() as unknown as UserRow[]).map((u) => ({
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(' '),
      roles: rolesOf(u),
      status: u.status,
    })),
  );
}
