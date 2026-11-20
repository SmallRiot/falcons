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

/** «12 марта» из YYYY-MM-DD */
export const birthday = (d: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10,
    m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export const POS_LABEL: Record<string, string> = { F: 'Нападающий', D: 'Защитник', G: 'Вратарь' };
export const POS_SHORT: Record<string, string> = { F: 'НАП', D: 'ЗАЩ', G: 'ВРТ' };
export const ROLE_LABEL: Record<string, string> = { admin: 'Админ', coach: 'Тренер', service: 'Сервис', guest: 'Гость' };
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

/** Лёд у команды один — подставляется в новые события (сервер делает то же, если поле пустое). */
export const DEFAULT_LOCATION = 'Арена Боба Уолша';

/** Банк по грузинскому IBAN: GE00 TB 0000000000000000 — две буквы после контрольных цифр. */
const IBAN_BANKS: Record<string, [string, string]> = {
  TB: ['TBC', 'TBC Bank'],
  BG: ['BOG', 'Bank of Georgia'],
  LB: ['Liberty', 'Liberty Bank'],
  CD: ['Credo', 'Credo Bank'],
  BS: ['Basis', 'Basisbank'],
  PC: ['ProCredit', 'ProCredit Bank'],
  HS: ['Halyk', 'Halyk Bank'],
  TR: ['Tera', 'Tera Bank'],
};
export function bankFromIban(iban: string): { code: string; name: string } {
  const c = iban.replace(/\s+/g, '').toUpperCase().slice(4, 6);
  const b = IBAN_BANKS[c];
  return b ? { code: b[0], name: b[1] } : { code: 'other', name: 'Банк' };
}
export const validIban = (iban: string) => /^GE\d{2}[A-Z]{2}\d{16}$/.test(iban.replace(/\s+/g, '').toUpperCase());
