/**
 * Значки у ника — как «</> DEV» у владельца. Выдаёт только владелец (на срок или навсегда).
 * Ключ хранится в базе; если значок отсюда убрать, у людей он просто перестанет показываться.
 */
export type Badge = { label: string; emoji: string; bg: string; fg: string; hint: string };

export const BADGES: Record<string, Badge> = {
  boss: { label: 'БОСС', emoji: '👑', bg: 'linear-gradient(90deg,#b8862b,#f6dc9c,#c8963e)', fg: '#2b1d00', hint: 'Главный по льду' },
  wine: { label: 'ВИНО', emoji: '🍷', bg: 'linear-gradient(90deg,#5a0f2e,#a3214f)', fg: '#ffe3ee', hint: 'Сомелье раздевалки' },
  beer: { label: 'ПИВО', emoji: '🍺', bg: 'linear-gradient(90deg,#f2a516,#ffd56b)', fg: '#3a2200', hint: 'Третий период — в баре' },
  chacha: { label: 'ЧАЧА', emoji: '🥃', bg: 'linear-gradient(90deg,#d9c7a3,#f5ecd7)', fg: '#3a2a10', hint: 'Крепче только бросок' },
  khinkali: { label: 'ХИНКАЛИ', emoji: '🥟', bg: 'linear-gradient(90deg,#f3e3c3,#ffd9a0)', fg: '#4a2c00', hint: 'Хвостики не ест' },
  captain: { label: 'КЭП', emoji: '©️', bg: 'linear-gradient(90deg,#0d3b66,#2b88cf)', fg: '#ffffff', hint: 'Капитан' },
  mvp: { label: 'MVP', emoji: '🏆', bg: 'linear-gradient(90deg,#7b61ff,#2ec4ff)', fg: '#ffffff', hint: 'Лучший игрок' },
  goat: { label: 'GOAT', emoji: '🐐', bg: 'linear-gradient(90deg,#1b1b1b,#4a4a4a)', fg: '#f6dc9c', hint: 'Величайший всех времён' },
  sniper: { label: 'СНАЙПЕР', emoji: '🎯', bg: 'linear-gradient(90deg,#c62828,#ff6b6b)', fg: '#ffffff', hint: 'Кладёт в девятку' },
  wall: { label: 'СТЕНА', emoji: '🧱', bg: 'linear-gradient(90deg,#8d4b2c,#c2714f)', fg: '#ffffff', hint: 'Не пробить' },
  tank: { label: 'ТАНК', emoji: '🚜', bg: 'linear-gradient(90deg,#3d5a2a,#6b8e3d)', fg: '#ffffff', hint: 'Едет — не остановить' },
  fire: { label: 'ОГОНЬ', emoji: '🔥', bg: 'linear-gradient(90deg,#ff4d00,#ffb300)', fg: '#2b0a00', hint: 'В ударе' },
  rookie: { label: 'НОВИЧОК', emoji: '🐣', bg: 'linear-gradient(90deg,#c8f7a0,#fff6a8)', fg: '#2c3a00', hint: 'Только встал на коньки' },
  late: { label: 'ОПОЗДУН', emoji: '⏰', bg: 'linear-gradient(90deg,#9aa5b1,#cfd8e3)', fg: '#1c2530', hint: 'Приходит к третьему периоду' },
  chill: { label: 'ЧИЛЛ', emoji: '😎', bg: 'linear-gradient(90deg,#2ec4ff,#9df3ca)', fg: '#06202a', hint: 'Спокоен как удав' },
  penalty: { label: 'ШТРАФНИК', emoji: '🚨', bg: 'linear-gradient(90deg,#111,#e53935)', fg: '#ffffff', hint: 'Прописан на скамейке штрафников' },
  veteran: { label: 'ВЕТЕРАН', emoji: '🎖', bg: 'linear-gradient(90deg,#4e5d2a,#a3a86b)', fg: '#ffffff', hint: 'В команде дольше всех' },
  dj: { label: 'DJ', emoji: '🎧', bg: 'linear-gradient(90deg,#ff4fd8,#7b61ff)', fg: '#ffffff', hint: 'Музыка в раздевалке' },
};
