import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyRequest } from 'fastify';
import { uploadsDir } from './config.ts';
import { db, validBirthDate, type UserRow } from './db.ts';

/** Фото игроков лежат отдельно и отдаются без входа: имя файла — случайный UUID. */
export const avatarsDir = path.join(uploadsDir, 'avatars');
mkdirSync(avatarsDir, { recursive: true });
export const AVATAR_PREFIX = '/api/avatars/';
const AVATAR_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

export type ProfileBody = {
  number?: number | string | null;
  position?: string | null;
  first_name?: string;
  last_name?: string | null;
  birth_date?: string | null;
};

/** Меняет только присланные поля. Возвращает текст ошибки или null. Общая для «мой профиль» и правки админом. */
export function updateProfile(u: UserRow, b: ProfileBody): string | null {
  const pos = b.position === undefined ? u.position : b.position && ['F', 'D', 'G'].includes(b.position) ? b.position : null;
  const num =
    b.number === undefined ? u.number : b.number == null || b.number === '' ? null : Math.max(0, Math.min(99, Number(b.number)));
  if (num != null && Number.isNaN(num)) return 'Номер — число от 0 до 99';
  const first = b.first_name === undefined ? u.first_name : b.first_name.trim() || u.first_name;
  const last = b.last_name === undefined ? u.last_name : b.last_name?.trim() || null;
  let birth = u.birth_date;
  if (b.birth_date !== undefined) {
    birth = b.birth_date ? validBirthDate(b.birth_date) : null;
    if (b.birth_date && !birth) return 'Проверь дату рождения';
  }
  db.prepare('UPDATE users SET number = ?, position = ?, first_name = ?, last_name = ?, birth_date = ? WHERE id = ?').run(
    num,
    pos,
    first,
    last,
    birth,
    u.id,
  );
  return null;
}

function dropOldAvatar(url: string | null) {
  if (!url?.startsWith(AVATAR_PREFIX)) return;
  const file = path.join(avatarsDir, path.basename(url));
  if (existsSync(file)) unlinkSync(file);
}

/** Сохраняет фото из multipart (клиент уже обрезал до квадрата) и ставит его пользователю. */
export async function saveAvatar(req: FastifyRequest, userId: number) {
  const part = await req.file();
  if (!part) throw Object.assign(new Error('Нет файла'), { statusCode: 400 });
  const ext = AVATAR_TYPES[part.mimetype];
  if (!ext) {
    part.file.resume();
    throw Object.assign(new Error('Нужна картинка: jpg, png или webp'), { statusCode: 400 });
  }
  const buf = await part.toBuffer();
  const name = `${randomUUID()}${ext}`;
  writeFileSync(path.join(avatarsDir, name), buf);
  const old = db.prepare('SELECT photo_url FROM users WHERE id = ?').get(userId) as { photo_url: string | null };
  db.prepare('UPDATE users SET photo_url = ? WHERE id = ?').run(AVATAR_PREFIX + name, userId);
  dropOldAvatar(old?.photo_url ?? null);
  return AVATAR_PREFIX + name;
}

/** Убирает своё фото — вернётся аватар из Telegram при следующем входе. */
export function removeAvatar(userId: number) {
  const old = db.prepare('SELECT photo_url FROM users WHERE id = ?').get(userId) as { photo_url: string | null };
  db.prepare('UPDATE users SET photo_url = NULL WHERE id = ?').run(userId);
  dropOldAvatar(old?.photo_url ?? null);
}
