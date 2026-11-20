const TZ = 'Asia/Tbilisi';

export const fmt = {
  day: (iso: string) =>
    new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso)),
  dayLong: (iso: string) => {
    const s = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
    return s[0].toUpperCase() + s.slice(1);
  },
  time: (iso: string) =>
    new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)),
  dateShort: (iso: string) =>
    new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(iso)),
  month: (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    const s = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(new Date(y, m - 1, 1));
    return s[0].toUpperCase() + s.slice(1) + (y !== new Date().getFullYear() ? ` ${y}` : '');
  },
  monthShort: (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(y, m - 1, 1)).replace('.', '');
  },
  gel: (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('ru-RU')} ₾`),
  iban: (s: string) => s.replace(/(.{4})/g, '$1 ').trim(),
  relative: (iso: string) => {
    const diff = new Date(iso).getTime() - Date.now();
    const h = Math.round(diff / 3600e3);
    if (h < 0) return 'прошло';
    if (h < 1) return 'скоро';
    if (h < 24) return `через ${h} ч`;
    const d = Math.round(h / 24);
    return `через ${d} ${plural(d, 'день', 'дня', 'дней')}`;
  },
};

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10,
    m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export const POS_LABEL: Record<string, string> = { F: 'Нападающий', D: 'Защитник', G: 'Вратарь' };
export const POS_SHORT: Record<string, string> = { F: 'НАП', D: 'ЗАЩ', G: 'ВРТ' };
export const ROLE_LABEL: Record<string, string> = { admin: 'Админ', coach: 'Тренер', service: 'Сервис' };
export const PLAN_LABEL: Record<string, string> = {
  full: 'Полный',
  partial: 'Частичный',
  donation: 'Донат',
  exempt: 'Освобождён',
};
export const DUE_STATUS: Record<string, { label: string; tone: string }> = {
  unpaid: { label: 'Не оплачено', tone: 'warn' },
  pending: { label: 'На проверке', tone: 'info' },
  paid: { label: 'Оплачено', tone: 'ok' },
  rejected: { label: 'Скрин отклонён', tone: 'bad' },
};

/** ISO → значение для <input type="datetime-local"> в часовом поясе Тбилиси (UTC+4, без перехода на летнее). */
export function toLocalInput(iso: string) {
  const d = new Date(new Date(iso).getTime() + 4 * 3600e3);
  return d.toISOString().slice(0, 16);
}
export function fromLocalInput(v: string) {
  return new Date(new Date(v + ':00Z').getTime() - 4 * 3600e3).toISOString();
}
