/**
 * Значки у ника — в стиле «</> DEV» у владельца: моноширинный шрифт, код-префикс, градиент.
 * Без эмодзи. Выдаёт только владелец (на срок или навсегда).
 * Ключ хранится в базе; если значок отсюда убрать, у людей он просто перестанет показываться.
 */
export type Badge = { label: string; glyph: string; bg: string; fg: string; hint: string };

export const BADGES: Record<string, Badge> = {
  boss: { glyph: '$', label: 'БОСС', bg: 'linear-gradient(90deg,#f6dc9c,#e0b25a)', fg: '#2a1a00', hint: 'Главный по льду' },
  wine: { glyph: '◆', label: 'ВИНО', bg: 'linear-gradient(90deg,#f3a6c0,#c45c86)', fg: '#2a0614', hint: 'Сомелье раздевалки' },
  beer: { glyph: '~', label: 'ПИВО', bg: 'linear-gradient(90deg,#ffe08a,#f5a623)', fg: '#2a1800', hint: 'Третий период — в баре' },
  chacha: { glyph: '%', label: 'ЧАЧА', bg: 'linear-gradient(90deg,#f1ead8,#cdbb94)', fg: '#2a2010', hint: 'Крепче только бросок' },
  khinkali: { glyph: '@', label: 'ХИНКАЛИ', bg: 'linear-gradient(90deg,#ffd9b0,#f2a66b)', fg: '#2a1200', hint: 'Хвостики не ест' },
  captain: { glyph: '[C]', label: 'КЭП', bg: 'linear-gradient(90deg,#9fd0ff,#2b88cf)', fg: '#03192e', hint: 'Капитан' },
  mvp: { glyph: '★', label: 'MVP', bg: 'linear-gradient(90deg,#c9b8ff,#7b61ff)', fg: '#120838', hint: 'Лучший игрок' },
  goat: { glyph: '∞', label: 'GOAT', bg: 'linear-gradient(90deg,#3a3a3a,#111)', fg: '#f6dc9c', hint: 'Величайший всех времён' },
  sniper: { glyph: '>>', label: 'СНАЙПЕР', bg: 'linear-gradient(90deg,#ffb3b3,#ff5a5a)', fg: '#2e0505', hint: 'Кладёт в девятку' },
  wall: { glyph: '||', label: 'СТЕНА', bg: 'linear-gradient(90deg,#d7dee5,#8fa3b5)', fg: '#101c27', hint: 'Не пробить' },
  tank: { glyph: '=>', label: 'ТАНК', bg: 'linear-gradient(90deg,#c8e6a0,#7fae4a)', fg: '#142200', hint: 'Едет — не остановить' },
  fire: { glyph: '!!', label: 'ОГОНЬ', bg: 'linear-gradient(90deg,#ffc36b,#ff6a2b)', fg: '#2b0a00', hint: 'В ударе' },
  rookie: { glyph: 'v0.1', label: 'НОВИЧОК', bg: 'linear-gradient(90deg,#e8ffd0,#b6f08a)', fg: '#1a2a00', hint: 'Только встал на коньки' },
  late: { glyph: '+15m', label: 'ОПОЗДУН', bg: 'linear-gradient(90deg,#e3e8ee,#aab6c3)', fg: '#141c25', hint: 'Приходит к третьему периоду' },
  chill: { glyph: 'zzz', label: 'ЧИЛЛ', bg: 'linear-gradient(90deg,#b8f3ff,#7fd6f5)', fg: '#03202a', hint: 'Спокоен как удав' },
  penalty: { glyph: '2:00', label: 'ШТРАФНИК', bg: 'linear-gradient(90deg,#2a2a2a,#7a1010)', fg: '#ffd2d2', hint: 'Прописан на скамейке штрафников' },
  veteran: { glyph: 'v9.9', label: 'ВЕТЕРАН', bg: 'linear-gradient(90deg,#e6e3c8,#a9a36b)', fg: '#1f1d06', hint: 'В команде дольше всех' },
  dj: { glyph: '♪', label: 'DJ', bg: 'linear-gradient(90deg,#ffb0ec,#9b7bff)', fg: '#1c0630', hint: 'Музыка в раздевалке' },
};

/** Текст значка: «$ БОСС» — как «</> DEV». */
export const badgeText = (b: Badge) => `${b.glyph} ${b.label}`;
