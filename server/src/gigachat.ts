import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';

/**
 * GigaChat (Сбер). Ключ авторизации — GIGACHAT_CREDENTIALS (Basic), scope — GIGACHAT_SCOPE.
 * Серверы GigaChat подписаны корневым сертификатом Минцифры: доверяем ему ТОЛЬКО в запросах к GigaChat
 * (файл GIGACHAT_CA_FILE или server/certs/russian_trusted_root_ca.pem), остальной сервер его не видит.
 */
const CREDS = process.env.GIGACHAT_CREDENTIALS ?? '';
const SCOPE = process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';
export const GIGACHAT_MODEL = process.env.GIGACHAT_MODEL || 'GigaChat-2-Max';
const CA_FILE = process.env.GIGACHAT_CA_FILE || path.resolve(import.meta.dirname, '../certs/russian_trusted_root_ca.pem');

export const gigachatReady = () => !!CREDS && existsSync(CA_FILE);

let agent: https.Agent | null = null;
function tlsAgent() {
  agent ??= new https.Agent({ ca: readFileSync(CA_FILE), keepAlive: true });
  return agent;
}

function request(url: string, opts: { method: string; headers: Record<string, string>; body: string }, timeoutMs = 30_000) {
  return new Promise<{ status: number; json: unknown }>((resolve, reject) => {
    const req = https.request(url, { method: opts.method, headers: opts.headers, agent: tlsAgent(), timeout: timeoutMs }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, json: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode ?? 0, json: null });
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('GigaChat: таймаут')));
    req.on('error', reject);
    req.end(opts.body);
  });
}

let token: { value: string; until: number } | null = null;
let pending: Promise<string> | null = null;
/** Токен живёт ~30 минут; одновременные запросы ждут один и тот же запрос токена (иначе 429). */
function accessToken() {
  if (token && token.until - Date.now() > 60_000) return Promise.resolve(token.value);
  pending ??= fetchToken().finally(() => (pending = null));
  return pending;
}
async function fetchToken() {
  const r = await request('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${CREDS}`,
      RqUID: randomUUID(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: `scope=${encodeURIComponent(SCOPE)}`,
  });
  const j = r.json as { access_token?: string; expires_at?: number } | null;
  if (r.status !== 200 || !j?.access_token) throw new Error(`GigaChat oauth ${r.status}`);
  token = { value: j.access_token, until: j.expires_at ?? Date.now() + 25 * 60_000 };
  return token.value;
}

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

/** Один ответ модели. Ошибка — исключение, решает вызывающий (у нас есть запасной шаблон). */
export async function gigachat(messages: ChatMsg[], opts: { temperature?: number; maxTokens?: number } = {}) {
  const t = await accessToken();
  const r = await request('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ model: GIGACHAT_MODEL, messages, temperature: opts.temperature ?? 1.0, max_tokens: opts.maxTokens ?? 300 }),
  });
  const j = r.json as { choices?: { message?: { content?: string }; finish_reason?: string }[] } | null;
  if (r.status !== 200) throw new Error(`GigaChat ${r.status}`);
  const c = j?.choices?.[0];
  if (!c?.message?.content || c.finish_reason === 'blacklist') throw new Error('GigaChat: пустой ответ');
  return c.message.content.trim();
}
