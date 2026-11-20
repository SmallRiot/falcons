import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyRequest } from 'fastify';
import { uploadsDir } from './config.ts';

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/pdf': '.pdf',
};

/** Читает multipart: сохраняет первый файл, возвращает имя файла и текстовые поля. */
export async function readUpload(req: FastifyRequest) {
  const fields: Record<string, string> = {};
  let file: string | null = null;
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      const ext = ALLOWED[part.mimetype];
      if (!ext || file) {
        part.file.resume();
        if (!ext) throw Object.assign(new Error('Нужна картинка (jpg, png, webp, heic) или pdf'), { statusCode: 400 });
        continue;
      }
      const name = `${randomUUID()}${ext}`;
      await pipeline(part.file, createWriteStream(path.join(uploadsDir, name)));
      if (part.file.truncated) throw Object.assign(new Error('Файл слишком большой (до 10 МБ)'), { statusCode: 400 });
      file = name;
    } else {
      fields[part.fieldname] = String(part.value ?? '');
    }
  }
  return { file, fields };
}
