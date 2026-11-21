import type { PublicUser } from './api';

/** Ответ /api/admin/arcade — аналитика «Ледового дропа» и магазина. */
export interface ArcadeStats {
  totals: {
    players: number;
    active7: number;
    goals: number;
    balances: number;
    drops: number;
    wagered: number;
    won: number;
    rtp: number | null;
    bonusActivated: number;
    bonusCollected: number;
    bonusWagered: number;
    spent: number;
    orders: number;
    toIssue: number;
    bigWins: { multiplier: number; at: string | null; user: PublicUser }[];
  };
  byItem: { item: string; title: string; count: number; points: number }[];
  players: {
    user: PublicUser;
    balance: number;
    goals: number;
    drops: number;
    wagered: number;
    won: number;
    bonusWagered: number;
    bonus: { status: string; played: number; collected: boolean };
    lastPlayed: string | null;
    purchases: number;
    spent: number;
  }[];
  members: { user: PublicUser; balance: number }[];
  grants: { user_id: number; user: PublicUser; points: number; note: string | null; at: string }[];
  ai: {
    gigachat: boolean;
    chatToday: number;
    byProvider: { provider: string; model: string | null; posts: number; votes: number; avg: number | null; fire: number }[];
    recent: {
      id: number; provider: string; kind: string; text: string; context_n: number; created_at: string;
      first_name: string | null; last_name: string | null; votes: number; avg: number | null; fire: number;
    }[];
  };
  orders: {
    id: number;
    user: PublicUser;
    item: string;
    title: string;
    kind: string;
    price: number;
    option: string | null;
    status: string;
    created_at: string;
    expires_at: string | null;
    proof?: string | null;
    currency?: string;
  }[];
}

export const ORDER_STATUS: Record<string, [string, string]> = {
  new: ['Ждёт выдачи', 'warn'],
  awaiting: ['Проверь оплату', 'warn'],
  issued: ['Выдан', 'ok'],
  active: ['Действует', 'info'],
  used: ['Потрачен', ''],
  done: ['Готово', ''],
  cancelled: ['Отменён', 'bad'],
};

export const pts = (n: number) => `${Math.round(n * 10) / 10 === Math.round(n) ? Math.round(n).toLocaleString('ru-RU') : (Math.round(n * 10) / 10).toLocaleString('ru-RU')} очк.`;

export const PROVIDER_NAME: Record<string, string> = { gigachat: 'GigaChat', claude: 'Claude', template: 'Шаблон' };
