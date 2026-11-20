import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.ts';
import { db, hasRole, type Role, type UserRow } from './db.ts';
import { notifyAdminsNewUser } from './telegram.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow;
  }
}

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

/** Проверка подписи initData по алгоритму Telegram Mini Apps. */
export function verifyInitData(initData: string): TgUser | null {
  if (!config.botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheck = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(config.botToken).digest();
  const calc = createHmac('sha256', secret).update(dataCheck).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== calc.length || !timingSafeEqual(given, calc)) return null;
  const authDate = Number(params.get('auth_date') ?? 0);
  if (Date.now() / 1000 - authDate > 7 * 24 * 3600) return null;
  try {
    return JSON.parse(params.get('user') ?? 'null');
  } catch {
    return null;
  }
}

const getUser = db.prepare('SELECT * FROM users WHERE id = ?');

function upsertFromTelegram(tg: TgUser): UserRow {
  const existing = getUser.get(tg.id) as UserRow | undefined;
  if (existing) {
    db.prepare('UPDATE users SET username = ?, photo_url = COALESCE(?, photo_url) WHERE id = ?').run(
      tg.username ?? null,
      tg.photo_url ?? null,
      tg.id,
    );
  } else {
    const isAdmin = config.adminIds.includes(tg.id);
    db.prepare(
      'INSERT INTO users(id, first_name, last_name, username, photo_url, roles, status) VALUES(?,?,?,?,?,?,?)',
    ).run(
      tg.id,
      tg.first_name ?? '',
      tg.last_name ?? null,
      tg.username ?? null,
      tg.photo_url ?? null,
      isAdmin ? 'admin' : '',
      isAdmin ? 'active' : 'pending',
    );
    const created = getUser.get(tg.id) as unknown as UserRow;
    if (created.status === 'pending') void notifyAdminsNewUser(created);
  }
  return getUser.get(tg.id) as unknown as UserRow;
}

/** preHandler: определяет пользователя. Не проверяет статус — это делают guard'ы ниже. */
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization ?? '';
  if (header.startsWith('tma ')) {
    const tg = verifyInitData(header.slice(4));
    if (!tg) return reply.code(401).send({ error: 'Неверная подпись Telegram' });
    req.user = upsertFromTelegram(tg);
    return;
  }
  if (config.devAuth) {
    const devId = Number(req.headers['x-dev-user']);
    if (devId) {
      const u = getUser.get(devId) as UserRow | undefined;
      if (u) {
        req.user = u;
        return;
      }
    }
  }
  return reply.code(401).send({ error: 'Откройте приложение из Telegram' });
}

export async function requireActive(req: FastifyRequest, reply: FastifyReply) {
  if (req.user.status !== 'active') return reply.code(403).send({ error: 'Доступ ещё не открыт администратором' });
}

export const requireRole =
  (...roles: Role[]) =>
  async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.user.status !== 'active' || !hasRole(req.user, ...roles))
      return reply.code(403).send({ error: 'Недостаточно прав' });
  };
