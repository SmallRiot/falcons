import path from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import { items as CATALOG, openStore } from '../../arcade/store.mjs';
import { config } from './config.ts';
import { db, getSetting, resetStyleCache, setSetting, type UserRow } from './db.ts';
import { notifyAdminsPrize, postShoutOut } from './telegram.ts';
import { type PlayerFacts } from './compliment.ts';
import { POS_NAME_RU } from './posNames.ts';

export const arcadeDir = (userId: number) => path.join(config.dataDir, 'arcade', String(userId));

/** Типы поверх JS-модуля игры. */
export interface ArcadeStats {
  balance: number; goals: number; drops: number; wagered: number; won: number; bonusWagered: number; bonusWon: number;
  bonus: { status: string; played: number; collected: boolean };
  bigWins: { multiplier: number; at: string | null }[];
  lastPlayed: string | null;
  purchases: { item: string; price: number; option: string | null; at: string }[];
}
export interface ArcadeStore {
  state(): unknown;
  activate(): void;
  collect(): void;
  drop(commitment: string, nonce: string, stake: number, source?: string): unknown;
  buy(id: string, option?: string | null, price?: number | null): { purchaseId: number; item: unknown; option: string | null; at: string };
  refund(points: number): void;
  stats(): ArcadeStats;
  close(): void;
}

export function withStore<T>(userId: number, fn: (store: ArcadeStore) => T) {
  const store = openStore(arcadeDir(userId)) as unknown as ArcadeStore;
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

export type PrizeOrder = {
  id: number; user_id: number; item: string; title: string; kind: string; price: number;
  option: string | null; status: string; created_at: string; expires_at: string | null; done_at: string | null;
};

/** Покупка в магазине: списать очки в игре → заказ в базе клуба → эффект приза → уведомить админов. */
export function buyPrize(user: UserRow, itemId: string, option: string | null) {
  const ov = shopOverrides()[itemId];
  if (ov?.off) throw new Error('Эта ачивка сейчас не продаётся — загляни позже');
  const p = withStore(user.id, (s) => s.buy(itemId, option, ov?.price ?? null));
  const item = p.item as { id: string; name: string; price: number; kind: string; days?: number; period?: string };
  const now = new Date();
  let status = 'new';
  let expires: string | null = null;
  if (item.kind === 'voucher') status = 'active';
  if (item.kind === 'shout') status = 'done';
  if (item.kind === 'cosmetic') {
    status = 'active';
    // срок: месяц или до конца сезона; новое оформление того же вида перекрывает прежнее (последнее — главное)
    expires = item.period === 'season' ? seasonEnd().toISOString() : new Date(now.getTime() + (item.days ?? 30) * 864e5).toISOString();
  }
  const r = db
    .prepare(
      `INSERT INTO prize_orders(user_id, item, title, kind, price, option, status, created_at, expires_at, done_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(user.id, item.id, item.name, item.kind, item.price, p.option, status, now.toISOString(), expires, status === 'done' ? now.toISOString() : null);
  resetStyleCache();
  if (item.kind === 'shout') void shoutOut(user);
  void notifyAdminsPrize(user, { title: item.name, price: item.price, kind: item.kind, option: p.option });
  return db.prepare('SELECT * FROM prize_orders WHERE id = ?').get(r.lastInsertRowid) as unknown as PrizeOrder;
}

/** Все кошельки игры (папки DATA_DIR/arcade/<id>). */
export function arcadePlayers(): number[] {
  const dir = path.join(config.dataDir, 'arcade');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => /^-?\d+$/.test(d) && existsSync(path.join(dir, d, 'game.sqlite'))).map(Number);
}

/** Факты об игроке для комплимента: позиция, составы, посещаемость, голы в игре. */
export function playerFacts(u: UserRow): PlayerFacts {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const now = new Date().toISOString();
  const cnt = (type: string) =>
    (db
      .prepare(
        `SELECT COUNT(*) c FROM signups s JOIN events e ON e.id = s.event_id
         WHERE s.user_id = ? AND COALESCE(s.attended, s.status = 'in') = 1 AND e.cancelled = 0 AND e.type = ? AND e.starts_at BETWEEN ? AND ?`,
      )
      .get(u.id, type, since, now) as { c: number }).c;
  const trainings30 = cnt('training');
  const games30 = cnt('game');
  const total = (db.prepare(`SELECT COUNT(*) c FROM events WHERE cancelled = 0 AND type = 'training' AND starts_at BETWEEN ? AND ?`).get(since, now) as { c: number }).c;
  const squads = (db.prepare('SELECT s.name FROM user_squads us JOIN squads s ON s.id = us.squad_id WHERE us.user_id = ?').all(u.id) as { name: string }[]).map((r) => r.name);
  const st = withStore(u.id, (s) => s.stats());
  return {
    name: [u.first_name, u.last_name].filter(Boolean).join(' '),
    position: u.position ? POS_NAME_RU[u.position] ?? null : null,
    number: u.number ?? null,
    squads,
    trainings30,
    games30,
    attendancePct: total ? Math.round((trainings30 / total) * 100) : null,
    goals: st.goals,
    bigWin: st.bigWins.length ? Math.max(...st.bigWins.map((w) => w.multiplier)) : null,
  };
}

async function shoutOut(u: UserRow) {
  try {
    const { shoutOut: post } = await import('./aiBuddy.ts');
    await post(u, playerFacts(u));
  } catch (e) {
    console.warn('[shout] failed', (e as Error).message);
    await postShoutOut(u, null);
  }
}

/** Конец сезона для рамок «до конца сезона» (настройка season_end или SEASON_END, по умолчанию 31 мая 2027). */
export function seasonEnd() {
  const v = getSetting('season_end', process.env.SEASON_END || '2027-05-31');
  return new Date(`${v}T23:59:59+04:00`);
}

export const FOREVER = '9999-12-31T00:00:00.000Z';
export const FRAME_DESIGNS = ['torch', 'gold', 'ice', 'neon', 'fire', 'falcons', 'rainbow'];

/* ---------- управление магазином (только владелец): цена, скрытая цена, в продаже ---------- */
export type ShopOverride = { price?: number; hidden?: boolean; off?: boolean };
export function shopOverrides(): Record<string, ShopOverride> {
  try {
    return JSON.parse(getSetting('shop_overrides', '{}')) as Record<string, ShopOverride>;
  } catch {
    return {};
  }
}
type CatalogItem = { id: string; name: string; price: number; hidden?: boolean; kind: string; options?: string[] };
/** Каталог с правками владельца. includeOff — для админки (видно и снятое с продажи). */
export function catalog(includeOff = false) {
  const ov = shopOverrides();
  return (CATALOG as CatalogItem[])
    .map((i) => ({ ...i, price: ov[i.id]?.price ?? i.price, hidden: ov[i.id]?.hidden ?? !!i.hidden, off: !!ov[i.id]?.off, basePrice: i.price }))
    .filter((i) => includeOff || !i.off);
}
export function setShopOverride(id: string, patch: ShopOverride) {
  if (!(CATALOG as CatalogItem[]).some((i) => i.id === id)) throw new Error('Нет такой ачивки');
  const all = shopOverrides();
  const next = { ...(all[id] ?? {}), ...patch };
  if (next.price != null && !(Number.isSafeInteger(next.price) && next.price > 0)) throw new Error('Цена — целое число больше нуля');
  all[id] = next;
  setSetting('shop_overrides', JSON.stringify(all));
}
