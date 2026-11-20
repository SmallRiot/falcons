import { tg } from './tg';

const DEV_KEY = 'falcons.devUser';
const SESSION_KEY = 'falcons.session';

export function getSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}
export function setSession(token: string | null) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* приватный режим */
  }
}

export function getDevUser(): number | null {
  try {
    const v = localStorage.getItem(DEV_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}
export function setDevUser(id: number | null) {
  try {
    if (id) localStorage.setItem(DEV_KEY, String(id));
    else localStorage.removeItem(DEV_KEY);
  } catch {
    /* приватный режим */
  }
}

function authHeaders(): Record<string, string> {
  if (tg?.initData) return { authorization: `tma ${tg.initData}` };
  const session = getSession();
  if (session) return { authorization: `Bearer ${session}` };
  const dev = getDevUser();
  return dev ? { 'x-dev-user': String(dev) } : {};
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: { ...authHeaders(), ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? data?.message ?? `Ошибка ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
};

/** Скачать защищённый ресурс API (картинку) и вернуть blob-URL. */
export async function fetchBlobUrl(path: string): Promise<string> {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) throw new ApiError(res.status, 'Не удалось загрузить');
  return URL.createObjectURL(await res.blob());
}

export async function fetchFileUrl(name: string): Promise<string> {
  const res = await fetch(`/api/files/${encodeURIComponent(name)}`, { headers: authHeaders() });
  if (!res.ok) throw new ApiError(res.status, 'Не удалось загрузить файл');
  return URL.createObjectURL(await res.blob());
}

/* ---------- типы ---------- */

export type Role = 'admin' | 'coach' | 'service';

export interface PublicUser {
  id: number;
  name: string;
  first_name: string;
  last_name: string | null;
  username: string | null;
  photo_url: string | null;
  number: number | null;
  position: 'F' | 'D' | 'G' | null;
  birth_date?: string | null;
}

export interface Squad {
  id: number;
  name: string;
  short: string;
  color: string;
  division: number | null;
  sort: number;
}

export interface Me {
  user: PublicUser & { roles: Role[]; status: 'pending' | 'active' | 'rejected'; signup_blocked: boolean; squads?: number[]; profile_complete?: boolean };
  squads?: Squad[];
  debts?: { period_id: number; month: string; amount: number; status: string; comment: string | null }[];
  sharpeningDebt?: { count: number; total: number } | null;
  badges?: { pendingUsers?: number; proofs?: number; sharpenings?: number; sharpChecks?: number; sharpQueue?: number; unread?: number };
}

export interface EventSummary {
  id: number;
  type: 'training' | 'game';
  title: string | null;
  starts_at: string;
  duration_min: number;
  location: string | null;
  capacity: number | null;
  notes: string | null;
  cancelled: boolean;
  lineup_published: boolean;
  squads: Pick<Squad, 'id' | 'short' | 'name' | 'color'>[];
  score_us: number | null;
  score_them: number | null;
  going: number;
  out: number;
  my: 'in' | 'out' | null;
  myReserve: boolean;
  avatars: { id: number; first_name: string; last_name: string | null; photo_url: string | null }[];
}

export type Team = '' | 'dark' | 'light';
export interface LineupItem {
  user_id: number;
  team: Team;
  line: number;
  slot: string;
}

export interface EventDetail extends EventSummary {
  canEdit: boolean;
  players: (PublicUser & { reserve: boolean })[];
  notGoing: PublicUser[];
  lineup: LineupItem[];
}

export type Plan = 'full' | 'partial' | 'donation' | 'exempt';
export type DueStatus = 'unpaid' | 'pending' | 'paid' | 'rejected';

export interface Period {
  id: number;
  month: string;
  budget: number;
  partial_ratio: number;
  donation_amount: number;
  locked: boolean;
  due_date: string | null;
}
export interface Rates {
  full: number;
  partial: number;
  donation: number;
  nFull: number;
  nPartial: number;
  nDonation: number;
  nUndecided: number;
  total: number;
}
export interface Account {
  id: number;
  bank: string;
  holder: string;
  iban: string;
  purpose: 'dues' | 'sharpening';
  pay_url: string | null;
  note: string | null;
  sort: number;
}
export interface FinanceData {
  items: {
    /** игроку бюджет сбора не отдаётся */
    period: Omit<Period, 'budget'>;
    /** до старта сбора ставок нет (null) */
    rates: Omit<Rates, 'total' | 'full' | 'partial'> & { full: number | null; partial: number | null };
    due: { plan: Plan | null; amount: number | null; custom_amount: number | null; status: DueStatus; comment: string | null; proof: string | null; submitted_at: string | null } | null;
  }[];
  accounts: Account[];
  sharpeningPrice: number;
  cardPayUrl: string | null;
}

export interface Notification {
  id: number;
  text: string;
  link: string | null;
  read: number;
  created_at: string;
}
