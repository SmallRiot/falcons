import { config } from './config.ts';
import { db, displayName, type UserRow } from './db.ts';
import { gigachat, gigachatReady, GIGACHAT_MODEL } from './gigachat.ts';
import { writeCompliment, type PlayerFacts } from './compliment.ts';
import { aiPostButtons, postAiToChat, postShoutOut, teamChatIdNow } from './telegram.ts';

/**
 * Нейронка в группе: «Респект в чате» по заказу и вечерний вкид в 20:00, если за день заказа не было.
 * Модель видит последние ~100 сообщений группы, пишет смешно, по-хоккейному и всегда хвалит.
 * Под постом — оценка «🔥 / 🙂 / 🥶», по ней ведём статистику нейронок.
 */

const KEEP_DAYS = 3;
const CONTEXT = 100;

/** Сообщение группы → короткий журнал (только текст, без медиа). */
export function logChatMessage(m: { chatId: number; threadId?: number; userId?: number; name: string; text: string }) {
  if (!m.text.trim() || m.text.startsWith('/')) return;
  db.prepare('INSERT INTO chat_log(chat_id, thread_id, user_id, name, text, at) VALUES(?,?,?,?,?,?)').run(
    String(m.chatId),
    m.threadId ?? null,
    m.userId ?? null,
    m.name.slice(0, 40),
    m.text.slice(0, 500),
    new Date().toISOString(),
  );
  if (Math.random() < 0.02) db.prepare('DELETE FROM chat_log WHERE at < ?').run(new Date(Date.now() - KEEP_DAYS * 864e5).toISOString());
}

function recentChat(limit = CONTEXT, since?: string) {
  const chat = teamChatIdNow();
  if (!chat) return [];
  const rows = db
    .prepare(`SELECT name, text, at FROM chat_log WHERE chat_id = ? ${since ? 'AND at >= ?' : ''} ORDER BY id DESC LIMIT ?`)
    .all(...((since ? [String(chat), since, limit] : [String(chat), limit]) as (string | number)[])) as { name: string; text: string; at: string }[];
  return rows.reverse();
}
const transcript = (rows: { name: string; text: string }[]) => rows.map((r) => `${r.name}: ${r.text.replace(/\s+/g, ' ')}`).join('\n');

const SYSTEM = `Ты — весёлый бот любительской хоккейной команды Falcons из Тбилиси. Пишешь короткие хоккейные шутки-комплименты в командный чат.
Правила:
- смешно, по-хоккейному и всегда по-доброму: хвалишь человека или команду;
- 1–3 предложения, до 300 символов, на русском, на «ты» или ко всем;
- можно одно-два эмодзи;
- не выдумывай факты и цифры; если опираешься на переписку — мягко, своими словами, без цитат и без личного;
- без политики, мата, стереотипов, сарказма и подколов в адрес людей;
- только текст поста, без кавычек, подписи и хештегов.`;

const ANGLES = ['скорость', 'бросок', 'пасы', 'характер', 'командный дух', 'стабильность', 'юмор в раздевалке', 'оборона', 'рост за сезон', 'заряд для команды'];
const pickAngle = () => ANGLES[Math.floor(Math.random() * ANGLES.length)];
const clean = (t: string) => t.trim().replace(/^["«»]+|["«»]+$/g, '').slice(0, 450);

type Written = { provider: 'gigachat' | 'claude' | 'template'; model: string | null; text: string | null; contextN: number };

async function writeShout(facts: PlayerFacts): Promise<Written> {
  const chat = recentChat();
  if (gigachatReady()) {
    try {
      const factLines = [
        `Имя: ${facts.name}`,
        facts.position ? `Позиция: ${facts.position}` : null,
        facts.number != null ? `Номер: ${facts.number}` : null,
        facts.squads.length ? `Состав: ${facts.squads.join(', ')}` : null,
        `За 30 дней: тренировок ${facts.trainings30}, игр ${facts.games30}${facts.attendancePct != null ? `, посещаемость ${facts.attendancePct}%` : ''}`,
        facts.bigWin ? `Ловил попадание ${facts.bigWin}× в игре клуба` : null,
      ].filter(Boolean);
      const text = await gigachat([
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content:
            `${facts.name} выкупил(а) «Респект в чате». Напиши ему/ей комплимент.\n\nФакты:\n${factLines.join('\n')}\n\nТема: ${pickAngle()}` +
            (chat.length ? `\n\nПоследние сообщения в чате (для настроения и темы):\n${transcript(chat)}` : ''),
        },
      ]);
      return { provider: 'gigachat', model: GIGACHAT_MODEL, text: clean(text), contextN: chat.length };
    } catch (e) {
      console.warn('[ai] gigachat shout failed:', (e as Error).message);
    }
  }
  const claude = await writeCompliment(facts);
  if (claude) return { provider: 'claude', model: 'claude-opus-5-5', text: claude, contextN: 0 };
  return { provider: 'template', model: null, text: null, contextN: 0 };
}

function savePost(w: Written, kind: 'shout' | 'daily', userId: number | null, text: string) {
  const r = db
    .prepare('INSERT INTO ai_posts(provider, model, kind, user_id, text, context_n) VALUES(?,?,?,?,?,?)')
    .run(w.provider, w.model, kind, userId, text, w.contextN);
  return Number(r.lastInsertRowid);
}

/** «Респект в чате» по заказу из магазина. */
export async function shoutOut(user: UserRow, facts: PlayerFacts) {
  const w = await writeShout(facts);
  if (!w.text) {
    await postShoutOut(user, null);
    return;
  }
  const id = savePost(w, 'shout', user.id, w.text);
  const msg = await postAiToChat(`📣 <b>Респект ${displayName(user)}!</b>`, w.text, w.provider, aiPostButtons(id, { 3: 0, 2: 0, 1: 0 }));
  if (msg?.message_id) db.prepare('UPDATE ai_posts SET chat_id = ?, message_id = ? WHERE id = ?').run(String(teamChatIdNow()), msg.message_id, id);
}

const tbilisiDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: config.tz }).format(d);
const tbilisiHour = () => Number(new Intl.DateTimeFormat('en', { timeZone: config.tz, hour: 'numeric', hour12: false }).format(new Date()));

/** Вечерний вкид: в 20:00–22:00, если за день нейронка ещё ничего не писала и в чате было о чём. */
export async function runDailyVkid(force = false) {
  if (!gigachatReady() || !teamChatIdNow()) return;
  if (!force && (tbilisiHour() < 20 || tbilisiHour() >= 22)) return;
  const today = tbilisiDay();
  const posts = db.prepare('SELECT created_at FROM ai_posts ORDER BY id DESC LIMIT 20').all() as { created_at: string }[];
  if (!force && posts.some((p) => tbilisiDay(new Date(p.created_at)) === today)) return;
  const startOfDay = new Date(Date.now() - 24 * 3600e3).toISOString();
  const chat = recentChat(CONTEXT, startOfDay);
  if (!force && chat.length < 10) return; // за день почти не писали — молчим
  try {
    const text = clean(
      await gigachat([
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Вечерний вкид дня. Вот о чём сегодня говорили в чате:\n${transcript(chat)}\n\nНапиши смешной хоккейный вкид в тему разговора, который хвалит команду или кого-то из обсуждения.`,
        },
      ]),
    );
    const w: Written = { provider: 'gigachat', model: GIGACHAT_MODEL, text, contextN: chat.length };
    const id = savePost(w, 'daily', null, text);
    const msg = await postAiToChat('🏒 <b>Вечерний вкид</b>', text, 'gigachat', aiPostButtons(id, { 3: 0, 2: 0, 1: 0 }));
    if (msg?.message_id) db.prepare('UPDATE ai_posts SET chat_id = ?, message_id = ? WHERE id = ?').run(String(teamChatIdNow()), msg.message_id, id);
    console.log(`[ai] вечерний вкид (${chat.length} сообщений)`);
  } catch (e) {
    console.warn('[ai] daily failed:', (e as Error).message);
  }
}

/** Оценка поста: один голос на человека, можно переголосовать. Возвращает новые счётчики. */
export function ratePost(postId: number, userId: number, score: number) {
  if (![1, 2, 3].includes(score)) return null;
  const post = db.prepare('SELECT id, chat_id, message_id FROM ai_posts WHERE id = ?').get(postId) as
    | { id: number; chat_id: string | null; message_id: number | null }
    | undefined;
  if (!post) return null;
  db.prepare(
    `INSERT INTO ai_ratings(post_id, user_id, score, at) VALUES(?,?,?,?) ON CONFLICT(post_id, user_id) DO UPDATE SET score = excluded.score, at = excluded.at`,
  ).run(postId, userId, score, new Date().toISOString());
  const counts = { 3: 0, 2: 0, 1: 0 } as Record<1 | 2 | 3, number>;
  for (const r of db.prepare('SELECT score, COUNT(*) c FROM ai_ratings WHERE post_id = ? GROUP BY score').all(postId) as { score: 1 | 2 | 3; c: number }[])
    counts[r.score] = r.c;
  return { post, counts };
}

/** Статистика нейронок для админа. */
export function aiStats() {
  const byProvider = db
    .prepare(
      `SELECT p.provider, p.model, COUNT(DISTINCT p.id) posts, COUNT(r.score) votes, AVG(r.score) avg,
              SUM(CASE WHEN r.score = 3 THEN 1 ELSE 0 END) fire
       FROM ai_posts p LEFT JOIN ai_ratings r ON r.post_id = p.id GROUP BY p.provider, p.model ORDER BY posts DESC`,
    )
    .all();
  const recent = db
    .prepare(
      `SELECT p.id, p.provider, p.kind, p.text, p.context_n, p.created_at, u.first_name, u.last_name,
              COUNT(r.score) votes, AVG(r.score) avg, SUM(CASE WHEN r.score = 3 THEN 1 ELSE 0 END) fire
       FROM ai_posts p LEFT JOIN ai_ratings r ON r.post_id = p.id LEFT JOIN users u ON u.id = p.user_id
       GROUP BY p.id ORDER BY p.id DESC LIMIT 30`,
    )
    .all();
  const chatToday = (db.prepare('SELECT COUNT(*) c FROM chat_log WHERE at >= ?').get(new Date(Date.now() - 864e5).toISOString()) as { c: number }).c;
  return { byProvider, recent, chatToday, gigachat: gigachatReady() };
}
