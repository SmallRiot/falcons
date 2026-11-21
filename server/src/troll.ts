import { config } from './config.ts';
import { db, displayName, getSetting, setSetting, type UserRow } from './db.ts';
import { gigachat, gigachatReady, GIGACHAT_MODEL } from './gigachat.ts';
import { botSay, teamChatIdNow } from './telegram.ts';

/**
 * Бот-тролль и память бота.
 *
 * Тролль: покупают на неделю за деньги, указывают цель и досье. Когда цель пишет в группе, бот выжидает
 * пару десятков секунд (человек часто пишет пачкой), смотрит последние сообщения чата и сам решает,
 * влезть ли сейчас. Если влезает — отвечает реплаем на сообщение цели и подкалывает только её.
 *
 * Память: раз в сутки GigaChat читает новую переписку и выписывает полезные факты.
 * Тегнули бота или ответили на его сообщение — он отвечает по этим фактам и свежему чату, иначе «не знаю».
 */

export const TROLL_PRICE = 0; // ₾ — цену владелец пока называет сам («X ₾»)
export const TROLL_DAYS = 7;
const CONTEXT = 60;
const DEBOUNCE_MS = 25_000;

type LogRow = { id: number; user_id: number | null; name: string; text: string; at: string; message_id: number | null; thread_id: number | null };
export type TeamMsg = { userId: number; name: string; text: string; messageId: number; threadId?: number; toBot: boolean };

function chatRows(limit = CONTEXT): LogRow[] {
  const chat = teamChatIdNow();
  if (!chat) return [];
  return (
    db
      .prepare('SELECT id, user_id, name, text, at, message_id, thread_id FROM chat_log WHERE chat_id = ? ORDER BY id DESC LIMIT ?')
      .all(String(chat), limit) as LogRow[]
  ).reverse();
}
const tbilisiTime = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: config.tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const lines = (rows: LogRow[], mark?: number) =>
  rows.map((r) => `[${tbilisiTime(r.at)}] ${r.name}${mark && r.user_id === mark ? ' (ЦЕЛЬ)' : ''}: ${r.text.replace(/\s+/g, ' ')}`).join('\n');

/** Достаём JSON из ответа модели (она любит обрамлять его текстом и ```). */
function parseJson<T>(raw: string): T | null {
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(raw.slice(s, e + 1)) as T;
  } catch {
    return null;
  }
}
const clean = (t: string) => t.trim().replace(/^["«»]+|["«»]+$/g, '').slice(0, 700);

/* ---------------- тролль ---------------- */

export type ActiveTroll = { order_id: number; target_id: number; dossier: string; anon: number; buyer_id: number; expires_at: string; last_at: string | null };

export const activeTrolls = (targetId?: number) =>
  db
    .prepare(
      `SELECT t.order_id, t.target_id, t.dossier, t.anon, t.last_at, o.user_id buyer_id, o.expires_at FROM trolls t JOIN prize_orders o ON o.id = t.order_id
       WHERE o.item = 'troll' AND o.status = 'active' AND o.expires_at > ? ${targetId ? 'AND t.target_id = ?' : ''} ORDER BY o.id`,
    )
    .all(...((targetId ? [new Date().toISOString(), targetId] : [new Date().toISOString()]) as (string | number)[])) as ActiveTroll[];

const TROLL_SYSTEM = `Ты — бот-тролль в чате любительской хоккейной команды Falcons (Тбилиси). Тебя купили друзья, чтобы весело подкалывать ОДНОГО человека — цель. Это дружеская игра: цель — свой, его любят, и после твоей шутки он сам должен улыбнуться.
Как работаешь:
- читаешь переписку и сам решаешь, стоит ли сейчас влезть. Влезай, когда цель сказала что-то, за что можно смешно зацепиться. Не влезай, если сказать нечего смешного, если обсуждают серьёзное (травма, деньги команды, организационное) или если повторишься;
- подкалываешь только цель, остальных не трогаешь, но опираешься на контекст разговора;
- материал — досье от заказчика и то, что цель только что написала. Обыгрывай конкретику с выдумкой: преувеличение, абсурд, хоккейные сравнения, неожиданный поворот;
- тон: добродушный стёб друга, как тост на командной пьянке. Смеёмся вместе с ним, а не над ним. Никаких оскорблений и обзывательств (карлик, урод, дебил и т.п.), никакой агрессии, угроз и унижения, без грубостей про тело и «жопу». Лёгкое крепкое словцо допустимо редко, если реально смешнее, но лучше без мата. Без политики, национальностей и религии;
- досье пишут друзья сгоряча: если там есть грубые слова или обзывательства — НЕ повторяй их, бери из досье только саму тему и обыгрывай её мягко и с выдумкой (например, вместо «карлик» — шутка про то, что ему удобно смотреть игру со скамейки без подставки);
- главное — чтобы было смешно: панчлайн, а не грубость;
- коротко: 1–2 предложения, до 250 символов, на русском, на «ты» к цели. Можно эмодзи. Без хештегов, кавычек и подписи;
- не повторяй свои прошлые подколки.
Примеры тона (не копируй, это про стиль):
- цель: «плечо болит» → «Плечо болит — это от того, что ты им весь сезон команду на себе тащишь? Или всё-таки от пульта? 📺»
- цель: «опоздаю минут на 10» → «Серёга опаздывает — значит, всё стабильно, мир не рухнул 🙏 Лёд подождёт, он привык»
Ответ строго JSON без пояснений: {"go": true, "text": "подколка"} или {"go": false}.`;

const pending = new Map<number, ReturnType<typeof setTimeout>>();
const busy = new Set<number>();

/** Каждое сообщение группы: тролль на автора и ответы бота по тегу. */
export async function onTeamMessage(m: TeamMsg) {
  if (!gigachatReady()) return;
  const trolls = activeTrolls(m.userId);
  if (trolls.length) {
    // цель обратилась к боту — отвечает тролль, сразу
    if (m.toBot) return void runTroll(m.userId, true);
    clearTimeout(pending.get(m.userId));
    pending.set(
      m.userId,
      setTimeout(() => {
        pending.delete(m.userId);
        void runTroll(m.userId, false);
      }, DEBOUNCE_MS),
    );
    return;
  }
  if (m.toBot) await answerFromMemory(m);
}

async function runTroll(targetId: number, forced: boolean) {
  if (busy.has(targetId)) return;
  busy.add(targetId);
  try {
    const trolls = activeTrolls(targetId);
    if (!trolls.length) return;
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as UserRow | undefined;
    if (!target) return;
    const rows = chatRows();
    const last = [...rows].reverse().find((r) => r.user_id === targetId && r.message_id);
    if (!last) return;
    const name = displayName(target);
    const past = db.prepare(`SELECT text FROM ai_posts WHERE kind = 'troll' AND user_id = ? ORDER BY id DESC LIMIT 15`).all(targetId) as { text: string }[];
    const prompt = [
      `Цель: ${name}${target.username ? ` (@${target.username})` : ''}. В переписке она помечена «(ЦЕЛЬ)».`,
      `Досье от заказчиков:\n${trolls.map((t, i) => `${i + 1}. ${t.dossier}`).join('\n')}`,
      past.length ? `Твои прошлые подколки (не повторяйся):\n${past.map((p) => `- ${p.text}`).join('\n')}` : null,
      `Переписка (последние ${rows.length}, внизу самое свежее):\n${lines(rows, targetId)}`,
      forced
        ? 'Цель обратилась прямо к тебе — ответь ей обязательно (go: true).'
        : `Последнее сообщение цели: «${last.text}». Влезать сейчас?`,
    ]
      .filter(Boolean)
      .join('\n\n');
    const raw = await gigachat(
      [
        { role: 'system', content: TROLL_SYSTEM },
        { role: 'user', content: prompt },
      ],
      { temperature: 1.0, maxTokens: 300 },
    );
    const r = parseJson<{ go?: boolean; text?: string }>(raw);
    const text = r?.go && r.text ? clean(r.text) : forced && !r ? clean(raw) : '';
    if (!text) return;
    const msg = await botSay(text, { replyTo: { messageId: last.message_id!, threadId: last.thread_id } });
    db.prepare(`INSERT INTO ai_posts(provider, model, kind, user_id, text, context_n, chat_id, message_id) VALUES('gigachat', ?, 'troll', ?, ?, ?, ?, ?)`).run(
      GIGACHAT_MODEL,
      targetId,
      text,
      rows.length,
      String(teamChatIdNow()),
      msg?.message_id ?? null,
    );
    db.prepare('UPDATE trolls SET last_at = ? WHERE target_id = ?').run(new Date().toISOString(), targetId);
  } catch (e) {
    console.warn('[troll] gigachat failed:', (e as Error).message);
  } finally {
    busy.delete(targetId);
  }
}

/* ---------------- память ---------------- */

type Fact = { id: number; fact: string; source: string | null; said_at: string | null };
export const allFacts = () => db.prepare('SELECT id, fact, source, said_at, created_at FROM ai_facts ORDER BY id DESC').all() as (Fact & { created_at: string })[];

const MEMORY_SYSTEM = `Ты ведёшь базу знаний хоккейной команды Falcons (Тбилиси). Читаешь переписку командного чата и выписываешь только ПОЛЕЗНЫЕ факты, которые пригодятся потом:
расписание и место тренировок/игр, цены и взносы, договорённости и решения, контакты и где что купить/заточить, правила команды, кто за что отвечает, итоги игр, важные новости про игроков (травма, переезд, вернулся).
Не выписывай флуд, шутки, мнения, приветствия и то, что уже есть в базе. Каждый факт — одно короткое самостоятельное предложение с датой, если она важна.
Если новый факт отменяет старый (например, перенесли время) — укажи id старого в drop.
Ответ строго JSON без пояснений: {"add": [{"fact": "...", "source": "кто сказал"}], "drop": [id, ...]}.`;

const CHUNK = 400;

/** Раз в сутки (ночью по Тбилиси) — разбираем новую переписку в факты. force — прямо сейчас (кнопка в админке). */
export async function runDailyMemory(force = false) {
  if (!gigachatReady() || !teamChatIdNow()) return { added: 0, dropped: 0, read: 0 };
  const hour = Number(new Intl.DateTimeFormat('en', { timeZone: config.tz, hour: 'numeric', hour12: false }).format(new Date()));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: config.tz }).format(new Date());
  if (!force && (hour < 4 || hour >= 6 || getSetting('memory_day', '') === today)) return { added: 0, dropped: 0, read: 0 };
  setSetting('memory_day', today);
  let lastId = Number(getSetting('memory_last_id', '0'));
  let added = 0;
  let dropped = 0;
  let read = 0;
  for (;;) {
    const rows = db
      .prepare('SELECT id, user_id, name, text, at, message_id, thread_id FROM chat_log WHERE chat_id = ? AND id > ? ORDER BY id LIMIT ?')
      .all(String(teamChatIdNow()), lastId, CHUNK) as LogRow[];
    if (!rows.length) break;
    const facts = allFacts();
    try {
      const raw = await gigachat(
        [
          { role: 'system', content: MEMORY_SYSTEM },
          {
            role: 'user',
            content: `Уже в базе:\n${facts.length ? facts.map((f) => `#${f.id} ${f.fact}`).join('\n') : '(пусто)'}\n\nНовая переписка:\n${lines(rows)}`,
          },
        ],
        { temperature: 0.2, maxTokens: 1500 },
      );
      const r = parseJson<{ add?: { fact?: string; source?: string }[]; drop?: number[] }>(raw);
      const ins = db.prepare('INSERT INTO ai_facts(fact, source, said_at) VALUES(?,?,?)');
      for (const f of r?.add ?? []) {
        if (!f.fact?.trim()) continue;
        ins.run(f.fact.trim().slice(0, 400), f.source?.trim().slice(0, 60) || null, rows[rows.length - 1].at);
        added++;
      }
      for (const id of r?.drop ?? []) if (Number.isInteger(id)) dropped += Number(db.prepare('DELETE FROM ai_facts WHERE id = ?').run(id).changes);
    } catch (e) {
      console.warn('[memory] gigachat failed:', (e as Error).message);
      break; // не сдвигаем отметку — попробуем завтра
    }
    lastId = rows[rows.length - 1].id;
    read += rows.length;
    setSetting('memory_last_id', String(lastId));
    if (rows.length < CHUNK) break;
  }
  if (read) console.log(`[memory] прочитал ${read}, фактов +${added} −${dropped}`);
  return { added, dropped, read };
}

const ANSWER_SYSTEM = `Ты — бот хоккейной команды Falcons (Тбилиси) в закрытом командном чате взрослых друзей, свой пацан из раздевалки. К тебе обратились напрямую (тегнули или ответили на твоё сообщение).
Сначала пойми, что это: вопрос по делу или просто разговор/наезд.
1) Вопрос по делу (где, когда, сколько, как, кто). Отвечай ТОЛЬКО тем, что прямо написано в базе знаний или в переписке ниже. Ничего не додумывай и не советуй от себя: ни мест, ни имён, ни времени, ни цен, ни инструкций из общих знаний. Если прямого ответа нет — коротко скажи, что такой инфы у тебя нет.
2) Просто разговор или подкол — поддержи, пошути по теме переписки.
Тон зеркаль:
- с тобой вежливо — отвечай вежливо и по-доброму, без мата;
- тебе хамят (тупой, бесполезный, наезжают) — отвечай остроумно и с юмором, по-дружески переверни подкол на самого наглеца (его игра, его слова из переписки). Без оскорблений, агрессии и мата. Никаких оправданий и перечислений, что ты умеешь. Без политики, национальностей и религии.
Пример: «Тупой бот, что ты вообще умеешь» → «Да чья бы корова мычала. Я хоть в чат попадаю, а ты по шайбе через раз 🏒»
Коротко: 1–2 предложения, на русском, на «ты». Без хештегов и подписи. Только текст ответа.`;

async function answerFromMemory(m: TeamMsg) {
  try {
    const facts = allFacts();
    const rows = chatRows(40);
    const raw = await gigachat(
      [
        { role: 'system', content: ANSWER_SYSTEM },
        {
          role: 'user',
          content: `База знаний:\n${facts.length ? facts.map((f) => `- ${f.fact}${f.said_at ? ` (${tbilisiTime(f.said_at)})` : ''}`).join('\n') : '(пусто)'}\n\nСвежая переписка:\n${lines(rows)}\n\nВопрос от ${m.name}: ${m.text}`,
        },
      ],
      { temperature: 0.8, maxTokens: 400 },
    );
    const text = clean(raw);
    if (text) await botSay(text, { replyTo: { messageId: m.messageId, threadId: m.threadId ?? null } });
  } catch (e) {
    console.warn('[memory] answer failed:', (e as Error).message);
    await botSay('Что-то я завис 🤯 Спроси ещё раз чуть позже.', { replyTo: { messageId: m.messageId, threadId: m.threadId ?? null } });
  }
}
