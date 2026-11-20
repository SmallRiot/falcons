/**
 * Всё общение бота: посты в командный чат, личные сообщения, кнопки.
 * Без BOT_TOKEN сообщения пишутся в консоль, а личные — ещё и в ленту уведомлений приложения.
 */
import { config } from './config.ts';
import { db, displayName, type UserRow } from './db.ts';
import { getEvent, goingCount, setSignup, type EventRow } from './signup.ts';
import { eventSquadIds, squadsMap } from './squads.ts';

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

/** Куда реально слать: в тестовом режиме — всё тестировщику. */
const TEAM = 'team';
function route(chatId: string | number) {
  if (!config.testChatId) return { to: chatId === TEAM ? config.teamChatId : chatId, label: '' };
  let label = '💬 в командный чат';
  if (chatId !== TEAM && String(chatId) !== String(config.teamChatId)) {
    const u = db.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(Number(chatId)) as
      | { first_name: string; last_name: string | null }
      | undefined;
    label = `👤 в личку: ${u ? esc([u.first_name, u.last_name].filter(Boolean).join(' ')) : chatId}`;
  }
  return { to: config.testChatId, label: `<i>🧪 тест · ${label}</i>\n\n` };
}

export function sendMessage(chatId: string | number, text: string, buttons?: Button[][]) {
  const { to, label } = route(chatId);
  if (!to) {
    console.log(`\n[tg → командный чат (TEAM_CHAT_ID не задан)]\n${stripHtml(text)}\n`);
    return Promise.resolve(null);
  }
  const job = queue.then(async () => {
    const r = await api('sendMessage', {
      chat_id: to,
      text: label + text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    });
    if (config.botToken) await new Promise((res) => setTimeout(res, GAP_MS));
    return r;
  });
  queue = job.catch(() => undefined);
  return job as Promise<{ message_id: number } | null>;
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

function eventPost(e: EventRow) {
  const going = goingCount(e.id);
  const sq = squadsMap();
  const squads = eventSquadIds(e.id).map((id) => sq.get(id)?.name).filter(Boolean).join(' + ');
  const head =
    e.type === 'game'
      ? `🥅 <b>ИГРА${squads ? ` · ${esc(squads)}` : ''}${e.title ? ` · ${esc(e.title)}` : ''}</b>`
      : `🏒 <b>ТРЕНИРОВКА${e.title ? ` · ${esc(e.title)}` : ''}</b>`;
  const spots = e.capacity
    ? going >= e.capacity
      ? `👥 Мест: ${e.capacity} — <b>всё занято</b>, дальше резерв`
      : `👥 Идут: <b>${going}</b> из ${e.capacity} — осталось ${e.capacity - going}`
    : `👥 Идут: <b>${going}</b>`;
  const lines = [
    head,
    '',
    `🗓 ${fmtDay(e.starts_at)}`,
    `⏰ ${fmtTime(e.starts_at)} · ${e.duration_min} мин`,
    e.location ? `📍 ${esc(e.location)}` : '',
    e.notes ? `📝 ${esc(e.notes)}` : '',
    '',
    e.cancelled ? '❌ <b>Отменено</b>' : spots,
  ].filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0));
  if (!e.cancelled) lines.push('', pick(['Жми кнопку — и ты на льду 👇', 'Отметься, чтобы тренер видел состав 👇', 'Кто с нами? 👇']));
  return lines.join('\n');
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
  const msg = await toTeamChat(eventPost(e), eventButtons(e));
  if (msg?.message_id) db.prepare('UPDATE events SET tg_message_id = ? WHERE id = ?').run(msg.message_id, e.id);
}

/** Обновляет счётчик в посте события в командном чате. */
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
      void api('editMessageText', {
        chat_id: teamTarget(),
        message_id: e.tg_message_id,
        text: (config.testChatId ? '<i>🧪 тест · 💬 в командный чат</i>\n\n' : '') + eventPost(e),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: eventButtons(e) },
      });
    }, 1500),
  );
}

/* ---------- пятёрки ---------- */

const ORD = ['', 'первой', 'второй', 'третьей', 'четвёртой'];
const TEAM_GEN: Record<string, string> = { dark: 'тёмных', light: 'светлых', '': '' };

export function notifyLineupPublished(e: EventRow) {
  return toTeamChat(
    [
      `📋 <b>Пятёрки готовы!</b>`,
      '',
      `${e.type === 'game' ? '🥅 Игра' : '🏒 Тренировка'} · ${dayWord(e.starts_at)}, ${fmtTime(e.starts_at)}`,
      'Тренер всех расставил — каждому написал в личку, где он играет 👀',
    ].join('\n'),
    [[{ text: '📋 Смотреть составы', url: appLink(`e${e.id}`) }]],
  );
}

export function lineupMessage(e: EventRow, item: { team: string; line: number }) {
  const team = TEAM_GEN[item.team] ?? '';
  const where =
    item.line === 0
      ? `в воротах${team ? ` у ${team}` : ''} 🧤`
      : `${item.line === 2 ? 'во' : 'в'} ${ORD[item.line] ?? `${item.line}-й`} пятёрке${team ? ` ${team}` : ''}`;
  const wish =
    e.type === 'game'
      ? pick(['Удачной игры! Порвём их 🥅🔥', 'Удачной игры, соколы! 🦅', 'Вперёд за победой! 🏆'])
      : pick(['Хорошей тренировки на льду! 🏒', 'Хорошего льда! ⛸', 'Покатаемся! 🏒💨']);
  return [
    `🦅 Ты ${dayWord(e.starts_at)} <b>${where}</b>.`,
    '',
    `⏰ ${fmtTime(e.starts_at)}${e.location ? ` · 📍 ${esc(e.location)}` : ''}`,
    '',
    wish,
  ].join('\n');
}

export function notifyLineupPersonal(e: EventRow, items: { user_id: number; team: string; line: number }[]) {
  return Promise.all(items.map((i) => dm(i.user_id, lineupMessage(e, i), `e${e.id}`, [[{ text: '📋 Состав', url: appLink(`e${e.id}`) }]])));
}

/* ---------- взносы ---------- */

export function notifyPollOpened(p: { month: string; partial_ratio: number; donation_amount: number }) {
  return toTeamChat(
    [
      `🗳 <b>Взносы на ${monthName(p.month)}</b>`,
      '',
      'Лёд, тренер, судьи — делим на всех. Выбери свой вариант:',
      '',
      '🔵 <b>Полный</b> — хожу на все тренировки, играю в чемпионате',
      `🟢 <b>Частичный</b> (${Math.round(p.partial_ratio * 100)}%) — тренировки не чаще раза в неделю, играю в чемпионате`,
      `💙 <b>Донат</b> (${p.donation_amount} ₾) — не играю в чемпионате, но поддерживаю команду`,
      '',
      '🧮 Суммы посчитаем, когда все выберут — и пришлём каждому лично.',
    ].join('\n'),
    [[{ text: '🗳 Выбрать вариант', url: appLink('finance') }]],
  );
}

export function notifyCollectionStarted(p: { month: string; due_date: string | null }, rates: { full: number; partial: number; donation: number }) {
  return toTeamChat(
    [
      `💰 <b>Сбор за ${monthName(p.month)} открыт!</b>`,
      '',
      `🔵 Полный — <b>${rates.full} ₾</b>`,
      `🟢 Частичный — <b>${rates.partial} ₾</b>`,
      `💙 Донат — <b>${rates.donation} ₾</b>`,
      '',
      `Каждому в личку прилетела его сумма. ${p.due_date ? `Оплати до ${new Date(p.due_date).getDate()} числа` : 'Оплати'} и прикрепи скрин 🧾`,
      'Реквизиты и копирование — в приложении в один тап.',
    ].join('\n'),
    [[{ text: '💳 Оплатить', url: appLink('finance') }]],
  );
}

const PLAN_NAME: Record<string, string> = { full: 'Полный 🔵', partial: 'Частичный 🟢', donation: 'Донат 💙', exempt: 'Освобождён' };

export function notifyDueAmount(userId: number, month: string, plan: string | null, amount: number) {
  return dm(
    userId,
    [
      `💰 <b>Сбор за ${monthName(month)} открыт</b>`,
      '',
      plan ? `Твой вариант: ${PLAN_NAME[plan] ?? plan}` : 'Сумма назначена админом',
      `К оплате: <b>${amount} ₾</b>`,
      '',
      'Переведи на счёт команды и прикрепи скрин — всё в приложении в пару тапов 👇',
    ].join('\n'),
    'finance',
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

export function reminderDues(userId: number, name: string, total: number, months: string[]) {
  const m = months.join(', ');
  return dm(
    userId,
    pick([
      `⏰ <b>Напоминалка от Falcons</b>\n\n${name}, за тобой взнос за ${m} — <b>${total} ₾</b>.\nЛёд сам себя не оплатит 🧊\n\nПереведи и прикрепи скрин 👇`,
      `🦅 ${name}, привет! Висит взнос за ${m}: <b>${total} ₾</b>.\nЗакроем, чтобы спокойно кататься? 🏒`,
      `💸 ${name}, вежливо стучимся: <b>${total} ₾</b> за ${m}.\nОдин перевод + один скрин — и ты свободен 🙌`,
    ]),
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
