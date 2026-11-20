/**
 * Всё общение бота: посты в командный чат, личные сообщения, кнопки.
 * Без BOT_TOKEN сообщения пишутся в консоль, а личные — ещё и в ленту уведомлений приложения.
 */
import { config } from './config.ts';
import { db, displayName, getSetting, setSetting, type UserRow } from './db.ts';
import { getEvent, goingCount, myFee, setSignup, type EventRow } from './signup.ts';
import { eventSquadIds, squadsMap } from './squads.ts';
import { h, kv, p, quote, toLegacyHtml, toPlain, type Block } from './rich.ts';
import { renderLineupPng, type Slot } from './lineupImage.ts';
import { renderBirthdayPng } from './birthdayCard.ts';
import { setPlan, type Period, type Plan } from './finance.ts';

type Button = { text: string; url?: string; callback_data?: string; web_app?: { url: string } };

async function api(method: string, body: Record<string, unknown>) {
  if (!config.botToken) {
    if (method === 'sendMessage') console.log(`\n[tg → ${body.chat_id}]\n${String(body.text).replace(/<[^>]+>/g, '')}\n`);
    return null;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
    if (!json.ok && !json.description?.includes('message is not modified')) console.warn(`[tg:${method}] ${json.description}`);
    return json.result ?? null;
  } catch (e) {
    console.warn(`[tg:${method}] failed`, e);
    return null;
  }
}

/* Очередь отправки: Telegram режет частые сообщения в один чат (~1/сек), поэтому шлём по одному. */
let queue: Promise<unknown> = Promise.resolve();
const GAP_MS = 1100;
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const job = queue.then(async () => {
    const r = await fn();
    if (config.botToken) await new Promise((res) => setTimeout(res, GAP_MS));
    return r;
  });
  queue = job.catch(() => undefined);
  return job;
}

/** Куда реально слать: в тестовом режиме — всё тестировщику, с пометкой «кому». */
const TEAM = 'team';
/** Тренировки и игры — каждая в свой топик группы (если заданы), остальное — в общий. */
const TEAM_TRAININGS = 'team:training';
const TEAM_GAMES = 'team:game';
/** взносы: опрос, «сбор открыт», должники */
const TEAM_DUES = 'team:dues';
const teamFor = (e: { type: string }) => (e.type === 'game' ? TEAM_GAMES : TEAM_TRAININGS);
const isTeam = (chatId: string | number) => typeof chatId === 'string' && chatId.startsWith(TEAM);
/**
 * Группа и топики: то, что админ задал командами /here_* прямо в группе (хранится в базе),
 * иначе — из .env (TEAM_CHAT_ID, TEAM_THREAD_*).
 */
const teamChatId = () => getSetting('team_chat_id', '') || config.teamChatId;
const threadSetting = (key: string, env: number) => Number(getSetting(key, '')) || env || 0;
function teamThread(chatId: string | number) {
  const general = threadSetting('thread_general', config.teamThreadId);
  if (chatId === TEAM_TRAININGS) return threadSetting('thread_trainings', config.trainingsThreadId) || general || undefined;
  if (chatId === TEAM_GAMES) return threadSetting('thread_games', config.gamesThreadId) || general || undefined;
  if (chatId === TEAM_DUES) return threadSetting('thread_dues', 0) || general || undefined;
  return general || undefined;
}
function route(chatId: string | number): { to: string | number; tag: string; thread?: number } {
  if (!config.testChatId) {
    if (isTeam(chatId)) return { to: teamChatId(), tag: '', thread: teamThread(chatId) };
    const team = String(chatId) === String(teamChatId());
    return { to: chatId, tag: '', thread: team ? teamThread(TEAM) : undefined };
  }
  let tag = '💬 в командный чат';
  if (!isTeam(chatId) && String(chatId) !== String(teamChatId())) {
    const u = db.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(Number(chatId)) as
      | { first_name: string; last_name: string | null }
      | undefined;
    tag = `👤 в личку: ${u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : chatId}`;
  }
  return { to: config.testChatId, tag: `🧪 тест · ${tag}` };
}

const inThread = (thread?: number) => (thread ? { message_thread_id: thread } : {});
const keyboard = (buttons?: Button[][]) => (buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {});

export function sendMessage(chatId: string | number, text: string, buttons?: Button[][]) {
  const { to, tag, thread } = route(chatId);
  if (!to) {
    console.log(`\n[tg → командный чат (TEAM_CHAT_ID не задан)]\n${stripHtml(text)}\n`);
    return Promise.resolve(null);
  }
  return enqueue(() =>
    api('sendMessage', {
      chat_id: to,
      ...inThread(thread),
      text: (tag ? `<i>${esc(tag)}</i>\n\n` : '') + text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...keyboard(buttons),
    }),
  ) as Promise<{ message_id: number } | null>;
}

/** Фото (PNG) с подписью и кнопками — multipart sendPhoto. */
export function sendPhoto(chatId: string | number, png: Buffer, caption: string, buttons?: Button[][]) {
  const { to, tag, thread } = route(chatId);
  const fullCaption = (tag ? `<i>${esc(tag)}</i>\n\n` : '') + caption;
  if (!to || !config.botToken) {
    console.log(`\n[tg photo → ${to || 'командный чат'}]\n${stripHtml(fullCaption)}\n`);
    return Promise.resolve(null);
  }
  return enqueue(async () => {
    const form = new FormData();
    form.set('chat_id', String(to));
    if (thread) form.set('message_thread_id', String(thread));
    form.set('caption', fullCaption.slice(0, 1024));
    form.set('parse_mode', 'HTML');
    if (buttons?.length) form.set('reply_markup', JSON.stringify({ inline_keyboard: buttons }));
    form.set('photo', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'lineup.png');
    try {
      const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendPhoto`, { method: 'POST', body: form });
      const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
      if (!json.ok) console.warn(`[tg:sendPhoto] ${json.description}`);
      return json.result ?? null;
    } catch (e) {
      console.warn('[tg:sendPhoto] failed', e);
      return null;
    }
  }) as Promise<{ message_id: number } | null>;
}

/** Rich-сообщение (таблицы, заголовки). Если Telegram его не примет — шлём обычный текст из тех же блоков. */
export function sendRich(chatId: string | number, blocks: Block[], buttons?: Button[][]) {
  const { to, tag, thread } = route(chatId);
  if (!to) {
    console.log(`\n[tg → командный чат (TEAM_CHAT_ID не задан)]\n${toPlain(blocks)}\n`);
    return Promise.resolve(null);
  }
  const all = tag ? [p(tag), ...blocks] : blocks;
  return enqueue(async () => {
    const r = await api('sendRichMessage', { chat_id: to, ...inThread(thread), rich_message: { blocks: all }, ...keyboard(buttons) });
    if (r) return r;
    if (config.botToken) console.warn('[tg] rich-сообщение не прошло — отправляю обычным текстом');
    return api('sendMessage', {
      chat_id: to,
      ...inThread(thread),
      text: toLegacyHtml(all),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...keyboard(buttons),
    });
  }) as Promise<{ message_id: number } | null>;
}

async function editRich(chatId: string | number, messageId: number, blocks: Block[], buttons?: Button[][]) {
  const tag = config.testChatId ? '🧪 тест · 💬 в командный чат' : '';
  const all = tag ? [p(tag), ...blocks] : blocks;
  const kb = { reply_markup: { inline_keyboard: buttons ?? [] } };
  const r = await api('editMessageText', { chat_id: chatId, message_id: messageId, rich_message: { blocks: all }, ...kb });
  if (r) return r;
  return api('editMessageText', { chat_id: chatId, message_id: messageId, text: toLegacyHtml(all), parse_mode: 'HTML', ...kb });
}

/** Если BOT_USERNAME не задан — узнаём у Telegram (нужно для ссылок t.me/<бот>). */
export async function resolveBotUsername() {
  if (!config.botToken || config.botUsername) return;
  const me = (await api('getMe', {})) as { username?: string } | null;
  if (me?.username) config.botUsername = me.username;
}

/* ---------- утилиты ---------- */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stripHtml = (t: string) => t.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const monthName = (ym: string) => MONTHS[Number(ym.split('-')[1]) - 1];

const tz = (opts: Intl.DateTimeFormatOptions) => (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: config.tz, ...opts }).format(new Date(iso));
const fmtTime = tz({ hour: '2-digit', minute: '2-digit' });
const fmtDay = tz({ weekday: 'long', day: 'numeric', month: 'long' });

function dayWord(iso: string) {
  const d = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: config.tz }).format(x);
  const target = d(new Date(iso));
  if (target === d(new Date())) return 'сегодня';
  if (target === d(new Date(Date.now() + 864e5))) return 'завтра';
  const s = fmtDay(iso);
  return `${/^вт/.test(s) ? 'во' : 'в'} ${s}`;
}

/** Ссылка, открывающая мини-апп сразу на нужном экране. */
export function appLink(start?: string) {
  if (config.botUsername && config.appShortName)
    return `https://t.me/${config.botUsername}/${config.appShortName}${start ? `?startapp=${start}` : ''}`;
  if (config.botUsername) return `https://t.me/${config.botUsername}${start ? `?startapp=${start}` : ''}`;
  return config.webappUrl || 'http://localhost:5180';
}

const LINK_LABEL: Record<string, string> = {
  finance: '💳 Оплатить',
  sharpening: '⛸ Открыть заточку',
  service: '⛸ Открыть очередь',
  'admin-finance': '🧾 Проверить',
  'admin-users': '👥 Открыть',
  home: '🦅 Открыть Falcons',
};
function english(id: number): boolean {
  return db.prepare('SELECT language FROM users WHERE id = ?').get(id)?.language === 'en';
}

const monthEn = (month: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(month + '-01T00:00:00Z'));
const planEn: Record<string, string> = { full: 'Full', partial: 'Partial', donation: 'Donation', exempt: 'Exempt' };
const eventEn = (e: EventRow) => {
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: config.tz, weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(e.starts_at));
  return (e.type === 'game' ? 'Game' : 'Practice') + (e.title ? ' · ' + esc(e.title) : '') + ' · ' + date + ', ' + fmtTime(e.starts_at);
};

const linkLabelsEn: Record<string, string> = {
  finance: '💳 Pay dues', sharpening: '⛸ Skate sharpening', service: '⛸ Open queue',
  'admin-finance': '🧾 Review payment', 'admin-users': '👥 View players', home: '🦅 Open Falcons',
};
const linkButton = (link: string, userId: number): Button => ({ text: english(userId) ? linkLabelsEn[link] ?? '🦅 Open' : LINK_LABEL[link] ?? '🦅 Открыть', url: appLink(link) });

/** Личное сообщение: в Telegram + в ленту уведомлений приложения. */
/** Гости (записаны админом, без Telegram) — им бот не пишет. */
const isGuest = (userId: number) =>
  (db.prepare('SELECT status FROM users WHERE id = ?').get(userId) as { status: string } | undefined)?.status === 'guest';

export function dm(userId: number, text: string, link?: string, buttons?: Button[][]) {
  if (isGuest(userId)) return Promise.resolve(null);
  db.prepare('INSERT INTO notifications(user_id, text, link) VALUES(?,?,?)').run(userId, stripHtml(text), link ?? null);
  const kb = buttons ?? (link ? [[linkButton(link, userId)]] : undefined);
  return sendMessage(userId, text, kb);
}

/** Личное rich-сообщение (таблицы) + запись в ленту приложения. */
export function dmRich(userId: number, blocks: Block[], link?: string, buttons?: Button[][]) {
  if (isGuest(userId)) return Promise.resolve(null);
  db.prepare('INSERT INTO notifications(user_id, text, link) VALUES(?,?,?)').run(userId, toPlain(blocks), link ?? null);
  return sendRich(userId, blocks, buttons ?? (link ? [[linkButton(link, userId)]] : undefined));
}

const shortName = (u: { first_name: string; last_name: string | null }) => `${u.first_name}${u.last_name ? ` ${u.last_name[0]}.` : ''}`;

function idsWithRole(role: string): number[] {
  return (db.prepare(`SELECT id, roles FROM users WHERE status='active'`).all() as { id: number; roles: string }[])
    .filter((u) => u.roles.split(',').includes(role))
    .map((u) => u.id);
}

/** Взносы и должники — в свой топик (/here_dues), иначе в общий. */
function toTeamChat(text: string, buttons?: Button[][]) {
  return sendMessage(TEAM_DUES, text, buttons);
}

/** Чат, где лежит пост события (в тестовом режиме — у тестировщика). */
const teamTarget = () => config.testChatId || teamChatId();

/* ---------- события ---------- */

function eventBlocks(e: EventRow): Block[] {
  const going = goingCount(e.id);
  const sq = squadsMap();
  const squads = eventSquadIds(e.id).map((id) => sq.get(id)?.name).filter(Boolean).join(' + ');
  const title =
    e.type === 'game'
      ? `🥅 Игра${squads ? ` · ${squads}` : ''}${e.title ? ` · ${e.title}` : ''}`
      : `🏒 Тренировка${e.title ? ` · ${e.title}` : ''}`;
  const spots = e.capacity
    ? going >= e.capacity
      ? `${going} из ${e.capacity} — мест нет, дальше резерв`
      : `${going} из ${e.capacity} · свободно ${e.capacity - going}`
    : `${going}`;
  const rows: [string, string][] = [
    ['🗓 Когда', `${fmtDay(e.starts_at)}, ${fmtTime(e.starts_at)}`],
    ['⏱ Длительность', `${e.duration_min} мин`],
  ];
  rows.push(['👥 Идут', e.cancelled ? '—' : spots]);
  const blocks: Block[] = [h(title, 2), kv(rows)];
  if (e.notes) blocks.push(p(`📝 ${e.notes}`));
  // Игровую заявку своего состава игроки открывают в приложении.
  if (!e.cancelled && e.type !== 'game') {
    const roster = db.prepare(`SELECT u.first_name, u.last_name, u.position
      FROM signups s JOIN users u ON u.id = s.user_id
      WHERE s.event_id = ? AND s.status = 'in' ORDER BY s.created_at, s.user_id`).all(e.id) as
      { first_name: string; last_name: string | null; position: string | null }[];
    const skaters = roster.filter(p => p.position !== 'G').map(shortName);
    const goalies = roster.filter(p => p.position === 'G').map(shortName);
    if (skaters.length) blocks.push(quote(`✅ Идут: ${skaters.join(', ')}`));
    if (goalies.length) blocks.push(quote(`🧤 Вратари: ${goalies.join(', ')}`));
  }
  blocks.push(p(e.cancelled ? '❌ Отменено' : pick(['Жми кнопку — и ты на льду 👇', 'Отметься, чтобы тренер видел состав 👇', 'Кто с нами? 👇'])));
  return blocks;
}

function eventButtons(e: EventRow): Button[][] {
  if (e.cancelled) return [];
  return [
    [
      { text: '✅ Иду', callback_data: `rsvp:${e.id}:in` },
      { text: '❌ Не иду', callback_data: `rsvp:${e.id}:out` },
    ],
    [{ text: '🦅 Открыть в приложении', url: appLink(`e${e.id}`) }],
  ];
}

export async function notifyEventCreated(e: EventRow) {
  const msg = await sendRich(teamFor(e), eventBlocks(e), eventButtons(e));
  if (msg?.message_id) db.prepare('UPDATE events SET tg_message_id = ? WHERE id = ?').run(msg.message_id, e.id);
}

/**
 * «Напомнить» от админа/тренера: пост события новым сообщением внизу топика.
 * Дальше счётчик обновляется уже в новом посте; у старого убираем кнопки, чтобы не путались.
 */
export async function remindEventInChat(e: EventRow) {
  const going = goingCount(e.id);
  const head = pick(['🔔 Напоминаем!', '🔔 Не забываем отметиться!', '🔔 Кто ещё с нами?']);
  const left = e.capacity ? Math.max(0, e.capacity - going) : null;
  const intro = p(`${head} ${left != null ? (left ? `Осталось мест: ${left}.` : 'Мест нет — дальше резерв.') : ''}`.trim());
  const msg = await sendRich(teamFor(e), [intro, ...eventBlocks(e)], eventButtons(e));
  if (!msg?.message_id) return false;
  const old = e.tg_message_id;
  db.prepare('UPDATE events SET tg_message_id = ? WHERE id = ?').run(msg.message_id, e.id);
  if (old && teamTarget())
    void api('editMessageReplyMarkup', { chat_id: teamTarget(), message_id: old, reply_markup: { inline_keyboard: [] } });
  return true;
}

/** Обновляет пост события в командном чате: счётчик и список идущих. */
const pendingRefresh = new Map<number, ReturnType<typeof setTimeout>>();
export function refreshEventPost(eventId: number) {
  if (!config.botToken || !teamTarget()) return;
  clearTimeout(pendingRefresh.get(eventId));
  pendingRefresh.set(
    eventId,
    setTimeout(() => {
      pendingRefresh.delete(eventId);
      const e = getEvent(eventId);
      if (!e?.tg_message_id) return;
      void editRich(teamTarget(), e.tg_message_id, eventBlocks(e), eventButtons(e));
    }, 1500),
  );
}

/* ---------- пятёрки: картинкой хоккейной площадки ---------- */

const ORD = ['', 'первой', 'второй', 'третьей', 'четвёртой'];
const TEAM_GEN: Record<string, string> = { dark: 'тёмных', light: 'светлых', '': '' };

const lineupSlots = (eventId: number): Slot[] =>
  (
    db
      .prepare(
        'SELECT l.user_id, l.team, l.line, l.slot, u.first_name, u.last_name, u.number FROM lineups l JOIN users u ON u.id = l.user_id WHERE l.event_id = ?',
      )
      .all(eventId) as { user_id: number; team: string; line: number; slot: string; first_name: string; last_name: string | null; number: number | null }[]
  ).map((r) => ({ user_id: r.user_id, team: r.team, line: r.line, slot: r.slot, name: shortName(r), number: r.number }));

function lineupTitle(e: EventRow) {
  const kind = e.type === 'game' ? 'ИГРА' : 'ТРЕНИРОВКА';
  return `${kind} · ${dayWord(e.starts_at).toUpperCase()}, ${fmtTime(e.starts_at)}`;
}

export function renderFor(e: EventRow, highlight?: number, en = false) {
  return renderLineupPng({
    english: en,
    title: en ? (e.type === 'game' ? 'GAME' : 'PRACTICE') + ' · ' + new Date(e.starts_at).toLocaleString('en-GB', { timeZone: config.tz, dateStyle: 'medium', timeStyle: 'short' }) : lineupTitle(e),
    slots: lineupSlots(e.id),
    highlightUserId: highlight,
    opponent: e.type === 'game' ? e.title : null,
  });
}

export function notifyLineupPublished(e: EventRow) {
  const caption = `📋 <b>Пятёрки готовы!</b> ${e.type === 'game' ? 'Игра' : 'Тренировка'} ${dayWord(e.starts_at)}, ${fmtTime(e.starts_at)}.\nКаждому написал в личку, где он играет 👀`;
  return sendPhoto(teamFor(e), renderFor(e), caption, [[{ text: '📋 Открыть в приложении', url: appLink(`e${e.id}`) }]]);
}

export function lineupCaption(e: EventRow, item: { team: string; line: number }) {
  const team = TEAM_GEN[item.team] ?? '';
  const where =
    item.line === 0
      ? `в воротах${team ? ` у ${team}` : ''} 🧤`
      : `${item.line === 2 ? 'во' : 'в'} ${ORD[item.line] ?? `${item.line}-й`} пятёрке${team ? ` ${team}` : ''}`;
  const wish =
    e.type === 'game'
      ? pick(['Удачной игры! Порвём их 🥅🔥', 'Удачной игры, соколы! 🦅', 'Вперёд за победой! 🏆'])
      : pick(['Хорошей тренировки на льду! 🏒', 'Хорошего льда! ⛸', 'Покатаемся! 🏒💨']);
  return `🦅 Ты ${dayWord(e.starts_at)} <b>${where}</b> — ты подсвечен на схеме.\n⏰ Начало в ${fmtTime(e.starts_at)}. ${wish}`;
}

/** Каждому — его площадка с подсветкой. Картинка рисуется ~50 мс. */
export async function notifyLineupPersonal(e: EventRow, items: { user_id: number; team: string; line: number }[]) {
  const TEST_CAP = 3; // в тестовом режиме всё летит одному человеку — не заваливаем картинками
  let skipped = 0;
  items.filter((i) => !isGuest(i.user_id)).forEach((i, idx) => {
    const en = english(i.user_id);
    const team = i.team === 'dark' ? ' for Team Dark' : i.team === 'light' ? ' for Team Light' : '';
    const caption = en ? `🦅 ${eventEn(e)}\nYou’re ${i.line === 0 ? 'in goal' : 'on line ' + i.line}${team}. Your position is highlighted on the diagram.` : lineupCaption(e, i);
    db.prepare('INSERT INTO notifications(user_id, text, link) VALUES(?,?,?)').run(i.user_id, stripHtml(caption), `e${e.id}`);
    if (config.testChatId && idx >= TEST_CAP) return void skipped++;
    void sendPhoto(i.user_id, renderFor(e, i.user_id, en), caption, [[{ text: en ? '📋 Open in app' : '📋 Открыть в приложении', url: appLink(`e${e.id}`) }]]);
  });
  if (skipped) void sendMessage(config.testChatId, `<i>🧪 тест · ещё ${skipped} личных схем не отправлено (лимит ${TEST_CAP}). В проде получит каждый.</i>`);
}

/* ---------- взносы ---------- */

const PLAN_NAME: Record<string, string> = { full: '🔵 Полный', partial: '🟢 Частичный', donation: '💙 Донат', exempt: 'Освобождён' };

interface PollPeriod {
  id: number;
  month: string;
  partial_ratio: number;
  donation_amount: number;
  locked: number;
  tg_message_id?: number | null;
}

function pollText(per: PollPeriod) {
  const counts = Object.fromEntries(
    (
      db
        .prepare(
          `SELECT d.plan, COUNT(*) c FROM dues d JOIN users u ON u.id = d.user_id WHERE d.period_id = ? AND u.status = 'active' AND d.plan IS NOT NULL GROUP BY d.plan`,
        )
        .all(per.id) as { plan: string; c: number }[]
    ).map((r) => [r.plan, r.c]),
  );
  const n = (k: string) => counts[k] ?? 0;
  return [
    `🗳 <b>Взносы на ${monthName(per.month)}</b>`,
    '',
    'Лёд, тренер, судьи — делим на всех. Выбери свой вариант кнопкой ниже:',
    '',
    `🔵 <b>Полный</b> — все тренировки + чемпионат · <b>${n('full')}</b>`,
    `🟢 <b>Частичный</b> (${Math.round(per.partial_ratio * 100)}%) — до 1 тренировки в неделю + чемпионат · <b>${n('partial')}</b>`,
    `💙 <b>Донат</b> (${per.donation_amount} ₾) — без чемпионата, поддержать команду · <b>${n('donation')}</b>`,
    '',
    per.locked ? '✅ Опрос закрыт — сбор начат, суммы пришли в личку.' : '🧮 Суммы посчитаем, когда все выберут, — и пришлём каждому лично.',
  ].join('\n');
}

function pollButtons(per: PollPeriod): Button[][] {
  const open = [[{ text: '🦅 Открыть в приложении', url: appLink('finance') }]];
  if (per.locked) return open;
  return [
    [
      { text: '🔵 Полный', callback_data: `plan:${per.id}:full` },
      { text: '🟢 Частичный', callback_data: `plan:${per.id}:partial` },
      { text: '💙 Донат', callback_data: `plan:${per.id}:donation` },
    ],
    ...open,
  ];
}

export async function notifyPollOpened(per: PollPeriod) {
  const msg = await toTeamChat(pollText(per), pollButtons(per));
  if (msg?.message_id) db.prepare('UPDATE periods SET tg_message_id = ? WHERE id = ?').run(msg.message_id, per.id);
}

/** Обновить счётчики голосов в посте опроса (и убрать кнопки, когда сбор начат). */
const pendingPoll = new Map<number, ReturnType<typeof setTimeout>>();
export function refreshPollPost(periodId: number) {
  if (!config.botToken || !teamTarget()) return;
  clearTimeout(pendingPoll.get(periodId));
  pendingPoll.set(
    periodId,
    setTimeout(() => {
      pendingPoll.delete(periodId);
      const per = db.prepare('SELECT * FROM periods WHERE id = ?').get(periodId) as PollPeriod | undefined;
      if (!per?.tg_message_id) return;
      void api('editMessageText', {
        chat_id: teamTarget(),
        message_id: per.tg_message_id,
        text: (config.testChatId ? '<i>🧪 тест · 💬 в командный чат</i>\n\n' : '') + pollText(per),
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: pollButtons(per) },
      });
    }, 1500),
  );
}

type RatesInfo = { full: number; partial: number; donation: number; nFull?: number; nPartial?: number; nDonation?: number };

export function notifyCollectionStarted(per: { month: string; due_date: string | null }, rates: RatesInfo) {
  return toTeamChat(
    [
      `💰 <b>Сбор за ${monthName(per.month)} открыт!</b>`,
      '',
      `🔵 Полный — <b>${rates.full} ₾</b>`,
      `🟢 Частичный — <b>${rates.partial} ₾</b>`,
      `💙 Донат — <b>${rates.donation} ₾</b>`,
      '',
      `Каждому в личку пришла его сумма. ${per.due_date ? `Оплати до ${new Date(per.due_date).getDate()} числа` : 'Оплати'} и прикрепи скрин 🧾`,
    ].join('\n'),
    [[{ text: '💳 Оплатить', url: appLink('finance') }]],
  );
}

export function notifyDueAmount(userId: number, month: string, plan: string | null, amount: number) {
  if (english(userId)) return dm(userId, `💰 <b>${monthEn(month)} dues are open</b>\n${plan ? 'Your option: ' + (planEn[plan] ?? plan) : 'Custom amount set by the admin'}\nAmount due: <b>${amount} ₾</b>. Transfer to the team account and attach a screenshot in the app.`, 'finance');
  return dm(
    userId,
    [
      `💰 <b>Сбор за ${monthName(month)} открыт</b>`,
      '',
      plan ? `Твой вариант: ${PLAN_NAME[plan] ?? plan}` : 'Сумма назначена админом',
      `К оплате: <b>${amount} ₾</b>`,
      '',
      'Переведи на счёт команды и прикрепи скрин — в приложении всё в пару тапов 👇',
    ].join('\n'),
    'finance',
  );
}

/** Список должников в командный чат (кнопка в консоли). */
export function postDebtorsList(month: string, rows: { name: string; amount: number }[]) {
  const total = rows.reduce((x, r) => x + r.amount, 0);
  return toTeamChat(
    [
      `📣 <b>Взносы за ${monthName(month)}: ждём оплату</b>`,
      '',
      ...rows.map((r, i) => `${i + 1}. ${esc(r.name)} — <b>${r.amount} ₾</b>`),
      '',
      `Итого: <b>${total} ₾</b>`,
      'Переведите, пожалуйста, и прикрепите скрин в приложении 🙏 Лёд сам себя не оплатит 🧊',
    ].join('\n'),
    [[{ text: '💳 Оплатить', url: appLink('finance') }]],
  );
}

/** Админ поменял человеку вариант или сумму (новичок посреди месяца, освобождение, своя сумма). */
export function notifyDueSetByAdmin(userId: number, month: string, plan: string | null, amount: number | null, locked: boolean) {
  if (plan === 'exempt' && (amount ?? 0) === 0)
    return dm(userId, english(userId) ? `🙌 You’re exempt from dues for ${monthEn(month)}.` : `🙌 Ты освобождён от взноса за ${monthName(month)}. Ничего платить не нужно.`, 'finance');
  if (!locked) return;
  return dm(
    userId,
    english(userId) ? `💰 ${monthEn(month)} dues (${plan ? planEn[plan] ?? plan : 'custom amount'}): ${amount ?? 0} ₾. Transfer the amount and attach a screenshot in the app.` : `💰 Взнос за ${monthName(month)}: ${plan ? PLAN_NAME[plan] ?? plan : 'своя сумма'} — ${amount ?? 0} ₾.\nПереведи и прикрепи скрин в приложении 👇`,
    'finance',
  );
}

export function notifyChoosePlanLate(userId: number, month: string) {
  return dm(userId, english(userId) ? `🗳 Collection for ${monthEn(month)} has started. Choose a dues option to see your amount.` : `🗳 Сбор за ${monthName(month)} уже начался, а ты не выбрал вариант. Выбери — и сразу увидишь сумму 👇`, 'finance');
}

export const notifyDuePaid = (userId: number, month: string) =>
  dm(userId, english(userId) ? `✅ Your dues for ${monthEn(month)} have been received. Thank you! 🏒` : pick([`✅ Оплата за ${monthName(month)} получена. Спасибо, что ты с нами! 💙`, `✅ Взнос за ${monthName(month)} принят. Лёд оплачен — увидимся на тренировке! 🏒`]));

export const notifyDueRejected = (userId: number, month: string, comment?: string) =>
  dm(userId, english(userId) ? `⚠️ Your payment screenshot for ${monthEn(month)} was declined.${comment ? "\n💬 " + esc(comment) : ""}\nPlease upload it again.` : `⚠️ Скрин оплаты за ${monthName(month)} не принят${comment ? `:\n«${esc(comment)}»` : ''}.\n\nЗагрузи, пожалуйста, ещё раз 👇`, 'finance');

/* ---------- доступ ---------- */

export const notifyAccessGranted = (userId: number) =>
  dm(
    userId,
    english(userId) ? '🦅 <b>Welcome to Falcons!</b> Your access is approved. Open the app and add your name and birthday to start signing up for ice time 🏒' : '🦅 <b>Добро пожаловать в Falcons!</b>\n\nДоступ открыт. Зайди в приложение и заполни профиль — имя, фамилию и дату рождения (поздравим в чате 🎂). Потом записывайся на лёд 🏒',
    'home',
  );

export const notifySignupBlocked = (userId: number) =>
  dm(userId, english(userId) ? '⛔️ Practice sign-up is paused until you pay your outstanding dues.' : '⛔️ Запись на тренировки на паузе, пока не закрыт долг по взносам.\n\nОплатишь — сразу откроем 🙌', 'finance');

export function notifyAdminsNewUser(u: UserRow) {
  const text = `🙋 <b>Новая заявка в команду</b>\n\n${esc(displayName(u))}${u.username ? ` (@${esc(u.username)})` : ''} хочет в Falcons. Пускаем?`;
  return Promise.all(
    idsWithRole('admin').map((id) =>
      dm(id, english(id) ? `🙋 <b>New membership request</b>\n${esc(displayName(u))}${u.username ? ' (@' + esc(u.username) + ')' : ''} wants to join Falcons.` : text, 'admin-users', [
        [
          { text: english(id) ? '✅ Approve' : '✅ Пустить', callback_data: `approve:${u.id}` },
          { text: english(id) ? '⛔️ Decline' : '⛔️ Отклонить', callback_data: `reject:${u.id}` },
        ],
      ]),
    ),
  );
}

export function notifyAdminsProof(u: UserRow, month: string, amount: number | null) {
  const text = `🧾 <b>${esc(displayName(u))}</b> прислал(а) скрин за ${monthName(month)}${amount ? ` — ${amount} ₾` : ''}. Проверишь?`;
  return Promise.all(idsWithRole('admin').map((id) => dm(id, english(id) ? `🧾 ${esc(displayName(u))} submitted a payment screenshot for ${monthEn(month)}${amount != null ? ' — ' + amount + ' ₾' : ''}. Please review it.` : text, 'admin-finance')));
}

/* ---------- заточка ---------- */

export function notifyServiceSharpening(u: UserRow, note: string | null, isPayment = false) {
  const text = isPayment
    ? `🧾 <b>${esc(displayName(u))}</b> прислал(а) скрин оплаты долга за заточку`
    : `⛸ <b>Новая заявка на заточку</b>\n\nОт: ${esc(displayName(u))}${note ? `\n💬 «${esc(note)}»` : ''}`;
  return Promise.all(idsWithRole('service').map((id) => dm(id, english(id) ? (isPayment ? `🧾 ${esc(displayName(u))} submitted a sharpening payment screenshot.` : `⛸ New sharpening request from ${esc(displayName(u))}.${note ? '\n💬 ' + esc(note) : ''}`) : text, 'service')));
}

export type SharpEvent = 'accepted' | 'done' | 'rejected' | 'debt' | 'unpaid' | 'paid';
export function notifySharpening(userId: number, ev: SharpEvent, opts: { amount?: number; comment?: string } = {}) {
  const c = opts.comment ? `\n💬 «${esc(opts.comment)}»` : '';
  const text: Record<SharpEvent, string> = {
    accepted: '⛸ Оплата ок — коньки взяли в работу. Скоро будут острее бритвы 🔪',
    done: pick(['✨ Коньки наточены! Можно забирать.', '✨ Готово! Коньки режут лёд как масло — забирай 🧈']),
    rejected: `⚠️ Заявку на заточку отклонили.${c}`,
    debt: `⛸ Точильщик отметил долг за заточку: <b>${opts.amount} ₾</b>.${c}\n\nОплати и прикрепи скрин 🙏`,
    unpaid: `⛸ Оплата за заточку не найдена — за тобой <b>${opts.amount} ₾</b>.${c}\n\nПрикрепи скрин ещё раз 🙏`,
    paid: '✅ Оплата за заточку подтверждена. Спасибо!',
  };
  const messagesEn: Record<SharpEvent, string> = {
    accepted: '⛸ Payment confirmed. Your skates are being sharpened.',
    done: '✨ Your skates are ready for pickup!',
    rejected: `⚠️ Your sharpening request was declined.${c}`,
    debt: `⛸ Your sharpening balance is <b>${opts.amount} ₾</b>.${c} Please pay and attach a screenshot.`,
    unpaid: `⛸ Your sharpening payment was not found. Amount due: <b>${opts.amount} ₾</b>.${c} Please attach your screenshot again.`,
    paid: '✅ Your sharpening payment was confirmed. Thank you!',
  };
  return dm(userId, english(userId) ? messagesEn[ev] : text[ev], 'sharpening');
}

/* ---------- дни рождения ---------- */

/** Открытка в командный чат + личное поздравление имениннику. */
export async function notifyBirthdays(people: { id: number; first_name: string; last_name: string | null; number: number | null }[]) {
  if (!people.length) return;
  const full = (u: (typeof people)[number]) => [u.first_name, u.last_name].filter(Boolean).join(' ');
  const who = people.map((u) => `<b>${esc(full(u))}</b>`).join(people.length > 2 ? ', ' : ' и ');
  const wish = pick([
    'Острых коньков, лёгких шайб и побольше голов! 🏒🎂',
    'Здоровья, скорости и чтобы шайба всегда шла в девятку! 🥅🎉',
    'Пусть лёд будет гладким, а пасы — точными! 🦅🎂',
  ]);
  const caption = `🎂 Сегодня день рождения у ${who}!\n\n${wish}\nСоколы, поздравляем в чате 👇`;
  await sendPhoto(TEAM, renderBirthdayPng(people.map((u) => ({ name: full(u), number: u.number }))), caption);
  for (const u of people)
    await dm(u.id, english(u.id) ? `🎂 <b>Happy birthday, ${esc(u.first_name)}!</b> Best wishes from the whole Falcons team 🏒` : `🎂 <b>${esc(u.first_name)}, с днём рождения!</b>\n\nВся команда Falcons поздравляет тебя. ${wish}`);
}

/* ---------- напоминания ---------- */

export function reminderDues(userId: number, name: string, debts: { month: string; amount: number }[]) {
  const total = debts.reduce((x, d) => x + d.amount, 0);
  if (english(userId)) return dm(userId, `⏰ ${esc(name)}, your outstanding dues for ${debts.map(d => monthEn(d.month)).join(', ')} total <b>${total} ₾</b>. Please pay and attach a screenshot.`, 'finance');
  const months = debts.map((d) => monthName(d.month)).join(', ');
  return dm(
    userId,
    pick([
      `⏰ <b>Напоминалка от Falcons</b>\n\n${esc(name)}, за тобой взнос за ${months} — <b>${total} ₾</b>.\nЛёд сам себя не оплатит 🧊\n\nПереведи и прикрепи скрин 👇`,
      `🦅 ${esc(name)}, привет! Висит взнос за ${months}: <b>${total} ₾</b>.\nЗакроем, чтобы спокойно кататься? 🏒`,
      `💸 ${esc(name)}, вежливо стучимся: <b>${total} ₾</b> за ${months}.\nОдин перевод + один скрин — и ты свободен 🙌`,
    ]),
    'finance',
  );
}

/* ---------- гости: оплата за выход ---------- */

const evName = (e: { type: string; title: string | null; starts_at: string }) =>
  `${e.type === 'game' ? 'игру' : 'тренировку'}${e.title ? ` «${esc(e.title)}»` : ''} ${dayWord(e.starts_at)}, ${fmtTime(e.starts_at)}`;

/** Гость записался — сразу просим оплатить выход (как с заточкой). */
export function notifyGuestFee(userId: number, e: EventRow, amount: number) {
  return dm(userId, english(userId) ? `🎟 You’re signed up: ${eventEn(e)}. Guest fee: ${amount} ₾. Please pay and attach a screenshot.` : `🎟 Записал тебя на ${evName(e)}.\nВыход для гостя — ${amount} ₾. Переведи и прикрепи скрин 👇`, `e${e.id}`);
}
export function notifyAdminsGuestFee(u: UserRow, e: EventRow, amount: number) {
  const text = `🎟 Гость <b>${esc(displayName(u))}</b> прислал(а) скрин за ${evName(e)} — ${amount} ₾. Проверишь?`;
  return Promise.all(idsWithRole('admin').map((id) => dm(id, english(id) ? `🎟 ${esc(displayName(u))} submitted a guest payment screenshot for ${eventEn(e)} — ${amount} ₾. Please review it.` : text, 'admin-fees')));
}
export function notifyGuestFeeResult(userId: number, e: EventRow, ok: boolean, comment?: string) {
  if (english(userId)) return dm(userId, ok
    ? `✅ Payment received for ${eventEn(e)}. See you on the ice!`
    : `⚠️ We couldn’t find your payment for ${eventEn(e)}.${comment ? '\n💬 ' + esc(comment) : ''} Please check your transfer and upload the screenshot again.`, `e${e.id}`);
  return dm(
    userId,
    ok
      ? `✅ Оплата за ${evName(e)} принята. До встречи на льду 🏒`
      : `⚠️ Оплату за ${evName(e)} не нашли.${comment ? `\n💬 «${esc(comment)}»` : ''}\nПроверь перевод и прикрепи скрин ещё раз 👇`,
    `e${e.id}`,
  );
}
export function reminderGuestFees(userId: number, total: number, n: number) {
  return dm(userId, english(userId) ? `⏰ Outstanding guest fees for ${n} ice sessions: <b>${total} ₾</b>. Please pay and attach a screenshot.` : `⏰ За тобой ${n > 1 ? `${n} выхода` : 'выход'} на лёд — <b>${total} ₾</b>. Переведи и прикрепи скрин, пожалуйста 🙏`, 'events');
}

export function reminderSharpening(userId: number, total: number) {
  if (english(userId)) return dm(userId, `⛸ Your sharpening balance is <b>${total} ₾</b>. Please pay and attach a screenshot.`, 'sharpening');
  return dm(
    userId,
    pick([
      `⛸ Коньки острые, а долг висит: <b>${total} ₾</b> за заточку. Закроем? 🙏`,
      `🔪 Напоминаем про заточку — <b>${total} ₾</b>. Прикрепи скрин, когда переведёшь 👇`,
    ]),
    'sharpening',
  );
}

export const reminderPlan = (userId: number, month: string) =>
  dm(userId, english(userId) ? `🗳 Please choose your dues option for ${monthEn(month)} so the team can calculate the rates.` : `🗳 Ты ещё не выбрал взнос на ${monthName(month)}.\nБез тебя не посчитать суммы для всей команды — это 10 секунд 👇`, 'finance');

export function reminderRsvp(userId: number, e: EventRow) {
  const kind = e.type === 'game' ? '🥅 Игра' : '🏒 Тренировка';
  return dm(userId, english(userId) ? `${eventEn(e)}\nAre you going? Please RSVP below.` : `${kind} ${dayWord(e.starts_at)} в ${fmtTime(e.starts_at)}\n\nТы ещё не отметился — идёшь?`, `e${e.id}`, [
    [
      { text: english(userId) ? '✅ Going' : '✅ Иду', callback_data: `rsvp:${e.id}:in` },
      { text: english(userId) ? '❌ Not going' : '❌ Не иду', callback_data: `rsvp:${e.id}:out` },
    ],
  ]);
}

/* ---------- long polling: /start, /chatid, кнопки ---------- */

interface Update {
  update_id: number;
  /** бота добавили в чат / убрали из него */
  my_chat_member?: { chat: { id: number; type: string; title?: string }; new_chat_member: { status: string }; old_chat_member: { status: string } };
  message?: { message_thread_id?: number; is_topic_message?: boolean; chat: { id: number; type: string; title?: string }; from?: { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean }; text?: string };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number } };
}

export async function startPolling() {
  if (!config.botToken || !config.botPolling) return;
  console.log('[tg] polling started');
  let offset = 0;
  for (;;) {
    const updates = (await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query', 'my_chat_member'] })) as Update[] | null;
    if (!updates) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    for (const u of updates) {
      offset = u.update_id + 1;
      try {
        await handleUpdate(u);
      } catch (e) {
        console.warn('[tg] update failed', e);
      }
    }
  }
}

const callbackErrors: Record<string, string> = {
  'Доступ ещё не открыт — дождись одобрения админа': 'Wait for the admin to approve your access.',
  'Событие отменено': 'Event canceled.',
  'Это событие другого состава': 'This event is for another squad.',
  'Событие уже началось': 'The event has already started.',
  'Запись закрыта — сначала закрой долг по взносам': 'Pay your outstanding dues to sign up.',
  'Неизвестный вариант': 'Unknown dues option.',
  'Доступ ещё не открыт': 'Access hasn’t been approved yet.',
  'Сбор уже идёт — поменять вариант может только админ': 'Collection is open. Contact the admin to change your option.',
  'Оплата уже отправлена — поменять вариант может только админ': 'Payment already submitted. Contact the admin to change your option.',
};
const answer = (id: string, text: string, alert = false) => api('answerCallbackQuery', { callback_query_id: id, text, show_alert: alert });

/** Бота добавили в группу — здороваемся и зовём всех написать ему /start (иначе он не может писать в личку). */
export function greetGroup(chatId: number) {
  const link = config.botUsername ? `https://t.me/${config.botUsername}?start=join` : null;
  return api('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text: [
      '🦅 <b>Всем привет! Я бот Falcons.</b>',
      '',
      'Теперь я буду:',
      '🏒 объявлять тренировки и игры — с кнопками «Иду / Не иду»;',
      '📋 присылать пятёрки — каждому в личку, где он играет;',
      '⏰ напоминать отметиться и про взносы, чтобы никто не забыл;',
      '🎂 поздравлять с днём рождения.',
      '',
      '⚙️ <i>Админу: напишите /here_trainings в топике тренировок, /here_games — игр, /here_dues — взносов, /here_general — где поздравления и общее.</i>',
      '',
      `👉 <b>Напишите мне /start в личку</b>${link ? '' : ` (@${esc(config.botUsername || 'бот')})`} — без этого я не смогу писать вам лично. Админ пустит в команду, и всё заработает.`,
    ].join('\n'),
    ...(link ? { reply_markup: { inline_keyboard: [[{ text: '👋 Написать боту /start', url: link }]] } } : {}),
  });
}

export async function handleUpdate(u: Update) {
  const mc = u.my_chat_member;
  if (mc && (mc.chat.type === 'group' || mc.chat.type === 'supergroup')) {
    const was = mc.old_chat_member.status;
    const now = mc.new_chat_member.status;
    const inChat = (st: string) => st === 'member' || st === 'administrator';
    if (inChat(now) && !inChat(was)) await greetGroup(mc.chat.id);
    return;
  }
  const m = u.message;
  if (m?.text) {
    const cmd = m.text.split(/[\s@]/)[0];
    // админ команды пишет в нужном топике группы: бот запоминает, куда что постить
    const HERE: Record<string, [string, string]> = {
      '/here_trainings': ['thread_trainings', 'тренировки'],
      '/here_games': ['thread_games', 'игры'],
      '/here_dues': ['thread_dues', 'взносы и должников'],
      '/here_general': ['thread_general', 'поздравления с ДР и общие объявления'],
    };
    if (HERE[cmd] && (m.chat.type === 'group' || m.chat.type === 'supergroup')) {
      const reply = (text: string) =>
        api('sendMessage', { chat_id: m.chat.id, ...inThread(m.is_topic_message ? m.message_thread_id : undefined), parse_mode: 'HTML', text });
      const who = m.from ? (db.prepare('SELECT * FROM users WHERE id = ?').get(m.from.id) as UserRow | undefined) : undefined;
      if (!who || who.status !== 'active' || !who.roles.split(',').includes('admin'))
        return void (await reply('🙅 Это может только админ Falcons.'));
      const [key, what] = HERE[cmd];
      const prevChat = teamChatId();
      // переехали в другую группу — старые топики не подходят
      if (String(prevChat) !== String(m.chat.id)) for (const k of Object.values(HERE)) setSetting(k[0], '');
      setSetting('team_chat_id', String(m.chat.id));
      setSetting(key, m.is_topic_message && m.message_thread_id ? String(m.message_thread_id) : '');
      const where = m.is_topic_message ? 'в этот топик' : 'сюда, в общий чат';
      const moved = prevChat && String(prevChat) !== String(m.chat.id) ? '\nℹ️ Раньше я постил в другую группу — теперь всё сюда.' : '';
      return void (await reply(`✅ Ок, ${what} буду постить ${where}.${moved}`));
    }
    if (cmd === '/chatid') {
      // отвечаем прямо там, где спросили (и в топике), без тестовой переадресации
      const topic = m.is_topic_message ? m.message_thread_id : undefined;
      await api('sendMessage', {
        chat_id: m.chat.id,
        ...inThread(topic),
        parse_mode: 'HTML',
        text: m.chat.type === 'private' && english(m.chat.id) ? `Chat ID: <code>${m.chat.id}</code>` : `chat id: <code>${m.chat.id}</code>${topic ? `\nтопик: <code>${topic}</code>` : ''}\n\nПришли это разработчику — бот будет постить ${topic ? 'в этот топик' : 'сюда'}.`,
      });
    }
    if (cmd === '/start' && m.chat.type === 'private' && m.from && !m.from.is_bot) {
      // /start = заявка в команду: человек появляется у админа в «Заявках», а бот теперь может ему писать
      const { upsertFromTelegram } = await import('./auth.ts');
      const was = db.prepare('SELECT status FROM users WHERE id = ?').get(m.from.id) as { status: string } | undefined;
      const me = upsertFromTelegram(m.from);
      const en = english(me.id);
      const btn: Button = config.webappUrl
        ? { text: en ? '🦅 Open Falcons' : '🦅 Открыть Falcons', web_app: { url: config.webappUrl } }
        : { text: en ? '🦅 Open Falcons' : '🦅 Открыть Falcons', url: appLink() };
      if (me.status === 'active')
        await sendMessage(m.chat.id, en ? '🦅 <b>Falcons Hockey Club</b>\nOpen the app for ice time, lineups, dues and skate sharpening 👇' : '🦅 <b>Falcons Hockey Club</b>\n\nЗапись на лёд, пятёрки, взносы и заточка — всё здесь 👇', [[btn]]);
      else if (me.status === 'rejected')
        await sendMessage(m.chat.id, en ? '🦅 Access denied. Contact the team admin if this looks wrong.' : '🦅 Доступ в Falcons закрыт. Если это ошибка — напиши админу команды.');
      else
        await sendMessage(
          m.chat.id,
          en ? (was ? '⏳ Your request is with the admin. I’ll let you know once it’s approved.' : '🦅 Your request to join Falcons was sent. I’ll message you when it’s approved.') : was
            ? '⏳ Заявка уже у админа — как только пустит, я напишу сюда.'
            : '🦅 <b>Привет! Заявка в Falcons отправлена.</b>\n\nАдмин посмотрит и пустит — я сразу напишу сюда. Отсюда же будут приходить тренировки, пятёрки и напоминания 🏒',
        );
    }
  }

  const cq = u.callback_query;
  if (!cq?.data) return;
  const [action, a, b] = cq.data.split(':');
  const actor = db.prepare('SELECT * FROM users WHERE id = ?').get(cq.from.id) as UserRow | undefined;

  const en = english(cq.from.id);
  if (action === 'rsvp') {
    const e = getEvent(Number(a));
    if (!e) return answer(cq.id, en ? 'Event not found' : 'Событие не найдено');
    if (!actor) return answer(cq.id, en ? 'Open Falcons and wait for approval first 🦅' : 'Сначала открой приложение Falcons и дождись доступа 🦅', true);
    const hadFee = !!myFee(e.id, actor.id);
    const err = setSignup(e, actor, b === 'in' ? 'in' : 'out');
    if (err) return answer(cq.id, en ? callbackErrors[err] ?? err : err, true);
    refreshEventPost(e.id);
    const fee = myFee(e.id, actor.id);
    if (fee && !hadFee) {
      void notifyGuestFee(actor.id, e, fee.amount);
      return answer(cq.id, en ? `You’re signed up! Guest fee: ${fee.amount} ₾. Payment details sent by DM 🎟` : `Записал! Выход для гостя — ${fee.amount} ₾, реквизиты прислал в личку 🎟`, true);
    }
    return answer(cq.id, en ? (b === 'in' ? 'You’re signed up! See you on the ice 🏒' : 'Got it. See you next time 👋') : b === 'in' ? pick(['Записал! До встречи на льду 🏒', 'Ты в деле! 💪', 'Отлично, ждём! 🦅']) : 'Понял, в другой раз 👋');
  }

  if (action === 'plan') {
    const per = db.prepare('SELECT * FROM periods WHERE id = ?').get(Number(a)) as Period | undefined;
    if (!per) return answer(cq.id, en ? 'Poll not found' : 'Опрос не найден');
    if (!actor || actor.status !== 'active') return answer(cq.id, en ? 'Open Falcons and wait for approval first 🦅' : 'Сначала открой приложение Falcons и дождись доступа 🦅', true);
    const err = setPlan(per, actor.id, b as Plan);
    if (err) return answer(cq.id, en ? callbackErrors[err] ?? err : err, true);
    refreshPollPost(per.id);
    return answer(cq.id, en ? `Saved: ${planEn[b] ?? b}. I’ll send your amount when collection opens.` : `Записал: ${PLAN_NAME[b] ?? b}. Сумму пришлю, когда начнём сбор 🧮`);
  }

  if (action === 'approve' || action === 'reject') {
    const isAdmin = actor?.status === 'active' && actor.roles.split(',').includes('admin');
    if (!isAdmin) return answer(cq.id, en ? 'Admins only' : 'Только для админов');
    const target = Number(a);
    const status = action === 'approve' ? 'active' : 'rejected';
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, target);
    if (status === 'active') await notifyAccessGranted(target);
    await answer(cq.id, en ? (status === 'active' ? 'Approved ✅' : 'Declined') : status === 'active' ? 'Пущен ✅' : 'Отклонён');
    if (cq.message)
      await api('editMessageReplyMarkup', {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
  }
}
