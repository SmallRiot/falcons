/**
 * Всё общение бота: посты в командный чат, личные сообщения, кнопки.
 * Без BOT_TOKEN сообщения пишутся в консоль, а личные — ещё и в ленту уведомлений приложения.
 */
import { config } from './config.ts';
import { db, displayName, type UserRow } from './db.ts';
import { getEvent, goingCount, setSignup, type EventRow } from './signup.ts';
import { eventSquadIds, squadsMap } from './squads.ts';
import { h, kv, p, quote, table, toLegacyHtml, toPlain, type Block } from './rich.ts';

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
function route(chatId: string | number) {
  if (!config.testChatId) return { to: chatId === TEAM ? config.teamChatId : chatId, tag: '' };
  let tag = '💬 в командный чат';
  if (chatId !== TEAM && String(chatId) !== String(config.teamChatId)) {
    const u = db.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(Number(chatId)) as
      | { first_name: string; last_name: string | null }
      | undefined;
    tag = `👤 в личку: ${u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : chatId}`;
  }
  return { to: config.testChatId, tag: `🧪 тест · ${tag}` };
}

const keyboard = (buttons?: Button[][]) => (buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {});

export function sendMessage(chatId: string | number, text: string, buttons?: Button[][]) {
  const { to, tag } = route(chatId);
  if (!to) {
    console.log(`\n[tg → командный чат (TEAM_CHAT_ID не задан)]\n${stripHtml(text)}\n`);
    return Promise.resolve(null);
  }
  return enqueue(() =>
    api('sendMessage', {
      chat_id: to,
      text: (tag ? `<i>${esc(tag)}</i>\n\n` : '') + text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...keyboard(buttons),
    }),
  ) as Promise<{ message_id: number } | null>;
}

/** Rich-сообщение (таблицы, заголовки). Если Telegram его не примет — шлём обычный текст из тех же блоков. */
export function sendRich(chatId: string | number, blocks: Block[], buttons?: Button[][]) {
  const { to, tag } = route(chatId);
  if (!to) {
    console.log(`\n[tg → командный чат (TEAM_CHAT_ID не задан)]\n${toPlain(blocks)}\n`);
    return Promise.resolve(null);
  }
  const all = tag ? [p(tag), ...blocks] : blocks;
  return enqueue(async () => {
    const r = await api('sendRichMessage', { chat_id: to, rich_message: { blocks: all }, ...keyboard(buttons) });
    if (r) return r;
    if (config.botToken) console.warn('[tg] rich-сообщение не прошло — отправляю обычным текстом');
    return api('sendMessage', {
      chat_id: to,
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
const linkButton = (link: string): Button => ({ text: LINK_LABEL[link] ?? '🦅 Открыть', url: appLink(link) });

/** Личное сообщение: в Telegram + в ленту уведомлений приложения. */
export function dm(userId: number, text: string, link?: string, buttons?: Button[][]) {
  db.prepare('INSERT INTO notifications(user_id, text, link) VALUES(?,?,?)').run(userId, stripHtml(text), link ?? null);
  const kb = buttons ?? (link ? [[linkButton(link)]] : undefined);
  return sendMessage(userId, text, kb);
}

/** Личное rich-сообщение (таблицы) + запись в ленту приложения. */
export function dmRich(userId: number, blocks: Block[], link?: string, buttons?: Button[][]) {
  db.prepare('INSERT INTO notifications(user_id, text, link) VALUES(?,?,?)').run(userId, toPlain(blocks), link ?? null);
  return sendRich(userId, blocks, buttons ?? (link ? [[linkButton(link)]] : undefined));
}

const shortName = (u: { first_name: string; last_name: string | null }) => `${u.first_name}${u.last_name ? ` ${u.last_name[0]}.` : ''}`;

function idsWithRole(role: string): number[] {
  return (db.prepare(`SELECT id, roles FROM users WHERE status='active'`).all() as { id: number; roles: string }[])
    .filter((u) => u.roles.split(',').includes(role))
    .map((u) => u.id);
}

function toTeamChat(text: string, buttons?: Button[][]) {
  return sendMessage(TEAM, text, buttons);
}

/** Чат, где лежит пост события (в тестовом режиме — у тестировщика). */
const teamTarget = () => config.testChatId || config.teamChatId;

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
  if (e.location) rows.push(['📍 Где', e.location]);
  rows.push(['👥 Идут', e.cancelled ? '—' : spots]);
  const blocks: Block[] = [h(title, 2), kv(rows)];
  if (e.notes) blocks.push(p(`📝 ${e.notes}`));
  const names = (
    db
      .prepare(`SELECT u.first_name, u.last_name FROM signups s JOIN users u ON u.id = s.user_id WHERE s.event_id = ? AND s.status = 'in' ORDER BY s.created_at`)
      .all(e.id) as { first_name: string; last_name: string | null }[]
  ).map(shortName);
  if (names.length && !e.cancelled) blocks.push(quote(`✅ Идут: ${names.join(', ')}`));
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
  const msg = await sendRich(TEAM, eventBlocks(e), eventButtons(e));
  if (msg?.message_id) db.prepare('UPDATE events SET tg_message_id = ? WHERE id = ?').run(msg.message_id, e.id);
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

/* ---------- пятёрки ---------- */

const ORD = ['', 'первой', 'второй', 'третьей', 'четвёртой'];
const TEAM_GEN: Record<string, string> = { dark: 'тёмных', light: 'светлых', '': '' };
const TEAM_TITLE: Record<string, string> = { dark: '⚫️ Тёмные', light: '⚪️ Светлые', '': '🦅 Состав' };
const FWD = ['LW', 'C', 'RW'];
const DEF = ['LD', 'RD'];

interface LineupRow {
  user_id: number;
  team: string;
  line: number;
  slot: string;
  first_name: string;
  last_name: string | null;
}
const lineupRows = (eventId: number) =>
  db
    .prepare('SELECT l.user_id, l.team, l.line, l.slot, u.first_name, u.last_name FROM lineups l JOIN users u ON u.id = l.user_id WHERE l.event_id = ?')
    .all(eventId) as unknown as LineupRow[];

/** Таблица пятёрок одной команды: строки — звенья, колонки — позиции. */
function teamTable(rows: LineupRow[], team: string, highlight?: number): Block[] {
  const mine = rows.filter((r) => r.team === team);
  const lines = Math.max(0, ...mine.map((r) => r.line));
  const name = (line: number, slot: string) => {
    const r = mine.find((x) => x.line === line && x.slot === slot);
    return r ? `${r.user_id === highlight ? '⭐ ' : ''}${shortName(r)}` : '';
  };
  const out: Block[] = [];
  if (lines > 0)
    out.push(
      table(
        ['', 'ЛН', 'ЦН', 'ПН', 'ЛЗ', 'ПЗ'],
        Array.from({ length: lines }, (_, i) => [`${i + 1}`, ...FWD.map((s) => name(i + 1, s)), ...DEF.map((s) => name(i + 1, s))]),
        { align: ['center', 'center', 'center', 'center', 'center', 'center'] },
      ),
    );
  const goalies = ['G1', 'G2'].map((s) => name(0, s)).filter(Boolean);
  if (goalies.length) out.push(p(`🧤 Вратари: ${goalies.join(', ')}`));
  return out;
}

export function notifyLineupPublished(e: EventRow) {
  const rows = lineupRows(e.id);
  const teams = ['dark', 'light', ''].filter((t) => rows.some((r) => r.team === t));
  const blocks: Block[] = [
    h(`📋 Пятёрки · ${e.type === 'game' ? 'игра' : 'тренировка'} ${dayWord(e.starts_at)}, ${fmtTime(e.starts_at)}`, 2),
  ];
  for (const t of teams) {
    if (teams.length > 1 || t) blocks.push(h(TEAM_TITLE[t], 3));
    blocks.push(...teamTable(rows, t));
  }
  blocks.push(p('Каждому написал в личку, где он играет 👀'));
  return sendRich(TEAM, blocks, [[{ text: '📋 Открыть в приложении', url: appLink(`e${e.id}`) }]]);
}

export function lineupBlocks(e: EventRow, item: { user_id: number; team: string; line: number }): Block[] {
  const team = TEAM_GEN[item.team] ?? '';
  const where =
    item.line === 0
      ? `в воротах${team ? ` у ${team}` : ''} 🧤`
      : `${item.line === 2 ? 'во' : 'в'} ${ORD[item.line] ?? `${item.line}-й`} пятёрке${team ? ` ${team}` : ''}`;
  const wish =
    e.type === 'game'
      ? pick(['Удачной игры! Порвём их 🥅🔥', 'Удачной игры, соколы! 🦅', 'Вперёд за победой! 🏆'])
      : pick(['Хорошей тренировки на льду! 🏒', 'Хорошего льда! ⛸', 'Покатаемся! 🏒💨']);
  const blocks: Block[] = [h(`🦅 Ты ${dayWord(e.starts_at)} ${where}`, 2)];
  if (item.line > 0) {
    const rows = lineupRows(e.id).filter((r) => r.team === item.team && r.line === item.line);
    const name = (slot: string) => {
      const r = rows.find((x) => x.slot === slot);
      return r ? `${r.user_id === item.user_id ? '⭐ ' : ''}${shortName(r)}` : '';
    };
    blocks.push(table(['ЛН', 'ЦН', 'ПН', 'ЛЗ', 'ПЗ'], [[...FWD, ...DEF].map(name)], { caption: 'Твоё звено', align: ['center', 'center', 'center', 'center', 'center'] }));
  }
  blocks.push(kv([['⏰ Начало', fmtTime(e.starts_at)], ...(e.location ? ([['📍 Где', e.location]] as [string, string][]) : [])]));
  blocks.push(p(wish));
  return blocks;
}

export function notifyLineupPersonal(e: EventRow, items: { user_id: number; team: string; line: number }[]) {
  return Promise.all(items.map((i) => dmRich(i.user_id, lineupBlocks(e, i), `e${e.id}`, [[{ text: '📋 Все пятёрки', url: appLink(`e${e.id}`) }]])));
}

/* ---------- взносы ---------- */

export function notifyPollOpened(per: { month: string; partial_ratio: number; donation_amount: number }) {
  return sendRich(
    TEAM,
    [
      h(`🗳 Взносы на ${monthName(per.month)}`, 2),
      p('Лёд, тренер, судьи — делим на всех. Выбери свой вариант:'),
      table(
        ['Вариант', 'Для кого', 'Сумма'],
        [
          ['🔵 Полный', 'все тренировки + чемпионат', 'посчитаем'],
          [`🟢 Частичный · ${Math.round(per.partial_ratio * 100)}%`, 'до 1 тренировки в неделю + чемпионат', 'посчитаем'],
          ['💙 Донат', 'без чемпионата, поддержать команду', `${per.donation_amount} ₾`],
        ],
        { align: ['left', 'left', 'right'] },
      ),
      p('🧮 Суммы посчитаем, когда все выберут, — и пришлём каждому лично.'),
    ],
    [[{ text: '🗳 Выбрать вариант', url: appLink('finance') }]],
  );
}

type RatesInfo = { full: number; partial: number; donation: number; nFull?: number; nPartial?: number; nDonation?: number };

export function notifyCollectionStarted(per: { month: string; due_date: string | null }, rates: RatesInfo) {
  const n = (x?: number) => (x == null ? '' : String(x));
  return sendRich(
    TEAM,
    [
      h(`💰 Сбор за ${monthName(per.month)} открыт!`, 2),
      table(
        ['Вариант', 'Человек', 'К оплате'],
        [
          ['🔵 Полный', n(rates.nFull), `${rates.full} ₾`],
          ['🟢 Частичный', n(rates.nPartial), `${rates.partial} ₾`],
          ['💙 Донат', n(rates.nDonation), `${rates.donation} ₾`],
        ],
        { align: ['left', 'center', 'right'] },
      ),
      p(`Каждому в личку пришла его сумма. ${per.due_date ? `Оплати до ${new Date(per.due_date).getDate()} числа` : 'Оплати'} и прикрепи скрин 🧾`),
    ],
    [[{ text: '💳 Оплатить', url: appLink('finance') }]],
  );
}

const PLAN_NAME: Record<string, string> = { full: '🔵 Полный', partial: '🟢 Частичный', donation: '💙 Донат', exempt: 'Освобождён' };

export function notifyDueAmount(userId: number, month: string, plan: string | null, amount: number) {
  return dmRich(
    userId,
    [
      h(`💰 Сбор за ${monthName(month)} открыт`, 2),
      kv([
        ['Твой вариант', plan ? (PLAN_NAME[plan] ?? plan) : 'назначен админом'],
        ['К оплате', `${amount} ₾`],
      ]),
      p('Переведи на счёт команды и прикрепи скрин — в приложении всё в пару тапов 👇'),
    ],
    'finance',
  );
}

/** Список должников в командный чат (кнопка в консоли). */
export function postDebtorsList(month: string, rows: { name: string; amount: number }[]) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return sendRich(
    TEAM,
    [
      h(`📣 Взносы за ${monthName(month)}: ждём оплату`, 2),
      table(['#', 'Игрок', 'Сумма'], rows.map((r, i) => [i + 1, r.name, `${r.amount} ₾`]), { align: ['center', 'left', 'right'], caption: `Итого: ${total} ₾` }),
      p('Переведите, пожалуйста, и прикрепите скрин в приложении 🙏 Лёд сам себя не оплатит 🧊'),
    ],
    [[{ text: '💳 Оплатить', url: appLink('finance') }]],
  );
}

export function notifyChoosePlanLate(userId: number, month: string) {
  return dm(userId, `🗳 Сбор за ${monthName(month)} уже начался, а ты не выбрал вариант. Выбери — и сразу увидишь сумму 👇`, 'finance');
}

export const notifyDuePaid = (userId: number, month: string) =>
  dm(userId, pick([`✅ Оплата за ${monthName(month)} получена. Спасибо, что ты с нами! 💙`, `✅ Взнос за ${monthName(month)} принят. Лёд оплачен — увидимся на тренировке! 🏒`]));

export const notifyDueRejected = (userId: number, month: string, comment?: string) =>
  dm(userId, `⚠️ Скрин оплаты за ${monthName(month)} не принят${comment ? `:\n«${esc(comment)}»` : ''}.\n\nЗагрузи, пожалуйста, ещё раз 👇`, 'finance');

/* ---------- доступ ---------- */

export const notifyAccessGranted = (userId: number) =>
  dm(userId, '🦅 <b>Добро пожаловать в Falcons!</b>\n\nДоступ открыт — заходи, записывайся на лёд и выбирай взнос 🏒', 'home');

export const notifySignupBlocked = (userId: number) =>
  dm(userId, '⛔️ Запись на тренировки на паузе, пока не закрыт долг по взносам.\n\nОплатишь — сразу откроем 🙌', 'finance');

export function notifyAdminsNewUser(u: UserRow) {
  const text = `🙋 <b>Новая заявка в команду</b>\n\n${esc(displayName(u))}${u.username ? ` (@${esc(u.username)})` : ''} хочет в Falcons. Пускаем?`;
  return Promise.all(
    idsWithRole('admin').map((id) =>
      dm(id, text, 'admin-users', [
        [
          { text: '✅ Пустить', callback_data: `approve:${u.id}` },
          { text: '⛔️ Отклонить', callback_data: `reject:${u.id}` },
        ],
      ]),
    ),
  );
}

export function notifyAdminsProof(u: UserRow, month: string, amount: number | null) {
  const text = `🧾 <b>${esc(displayName(u))}</b> прислал(а) скрин за ${monthName(month)}${amount ? ` — ${amount} ₾` : ''}. Проверишь?`;
  return Promise.all(idsWithRole('admin').map((id) => dm(id, text, 'admin-finance')));
}

/* ---------- заточка ---------- */

export function notifyServiceSharpening(u: UserRow, note: string | null, isPayment = false) {
  const text = isPayment
    ? `🧾 <b>${esc(displayName(u))}</b> прислал(а) скрин оплаты долга за заточку`
    : `⛸ <b>Новая заявка на заточку</b>\n\nОт: ${esc(displayName(u))}${note ? `\n💬 «${esc(note)}»` : ''}`;
  return Promise.all(idsWithRole('service').map((id) => dm(id, text, 'service')));
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
  return dm(userId, text[ev], 'sharpening');
}

/* ---------- напоминания ---------- */

export function reminderDues(userId: number, name: string, debts: { month: string; amount: number }[]) {
  const total = debts.reduce((x, d) => x + d.amount, 0);
  return dmRich(
    userId,
    [
      h(pick([`⏰ ${name}, напоминалка от Falcons`, `🦅 ${name}, висит взнос`, `💸 ${name}, вежливо стучимся`]), 2),
      table(['Месяц', 'Сумма'], [...debts.map((d) => [monthName(d.month), `${d.amount} ₾`]), ['Итого', `${total} ₾`]], { align: ['left', 'right'] }),
      p(pick(['Лёд сам себя не оплатит 🧊 Переведи и прикрепи скрин 👇', 'Один перевод + один скрин — и ты свободен 🙌', 'Закроем, чтобы спокойно кататься? 🏒'])),
    ],
    'finance',
  );
}

export function reminderSharpening(userId: number, total: number) {
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
  dm(userId, `🗳 Ты ещё не выбрал взнос на ${monthName(month)}.\nБез тебя не посчитать суммы для всей команды — это 10 секунд 👇`, 'finance');

export function reminderRsvp(userId: number, e: EventRow) {
  const kind = e.type === 'game' ? '🥅 Игра' : '🏒 Тренировка';
  return dm(userId, `${kind} ${dayWord(e.starts_at)} в ${fmtTime(e.starts_at)}${e.location ? ` · 📍 ${esc(e.location)}` : ''}\n\nТы ещё не отметился — идёшь?`, `e${e.id}`, [
    [
      { text: '✅ Иду', callback_data: `rsvp:${e.id}:in` },
      { text: '❌ Не иду', callback_data: `rsvp:${e.id}:out` },
    ],
  ]);
}

/* ---------- long polling: /start, /chatid, кнопки ---------- */

interface Update {
  update_id: number;
  message?: { chat: { id: number; type: string }; from?: { id: number }; text?: string };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number } };
}

export async function startPolling() {
  if (!config.botToken || !config.botPolling) return;
  console.log('[tg] polling started');
  let offset = 0;
  for (;;) {
    const updates = (await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] })) as Update[] | null;
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

const answer = (id: string, text: string, alert = false) => api('answerCallbackQuery', { callback_query_id: id, text, show_alert: alert });

async function handleUpdate(u: Update) {
  const m = u.message;
  if (m?.text) {
    const cmd = m.text.split(/[\s@]/)[0];
    if (cmd === '/chatid') await sendMessage(m.chat.id, `chat id: <code>${m.chat.id}</code>`);
    if (cmd === '/start' && m.chat.type === 'private') {
      const btn: Button = config.webappUrl
        ? { text: '🦅 Открыть Falcons', web_app: { url: config.webappUrl } }
        : { text: '🦅 Открыть Falcons', url: appLink() };
      await sendMessage(m.chat.id, '🦅 <b>Falcons Hockey Club</b>\n\nЗапись на лёд, пятёрки, взносы и заточка — всё здесь 👇', [[btn]]);
    }
  }

  const cq = u.callback_query;
  if (!cq?.data) return;
  const [action, a, b] = cq.data.split(':');
  const actor = db.prepare('SELECT * FROM users WHERE id = ?').get(cq.from.id) as UserRow | undefined;

  if (action === 'rsvp') {
    const e = getEvent(Number(a));
    if (!e) return answer(cq.id, 'Событие не найдено');
    if (!actor) return answer(cq.id, 'Сначала открой приложение Falcons и дождись доступа 🦅', true);
    const err = setSignup(e, actor, b === 'in' ? 'in' : 'out');
    if (err) return answer(cq.id, err, true);
    refreshEventPost(e.id);
    return answer(cq.id, b === 'in' ? pick(['Записал! До встречи на льду 🏒', 'Ты в деле! 💪', 'Отлично, ждём! 🦅']) : 'Понял, в другой раз 👋');
  }

  if (action === 'approve' || action === 'reject') {
    const isAdmin = actor?.status === 'active' && actor.roles.split(',').includes('admin');
    if (!isAdmin) return answer(cq.id, 'Только для админов');
    const target = Number(a);
    const status = action === 'approve' ? 'active' : 'rejected';
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, target);
    if (status === 'active') await notifyAccessGranted(target);
    await answer(cq.id, status === 'active' ? 'Пущен ✅' : 'Отклонён');
    if (cq.message)
      await api('editMessageReplyMarkup', {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
  }
}
