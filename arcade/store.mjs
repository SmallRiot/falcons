import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';

export const payouts = [1000, 100, 20, 10, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 10, 20, 100, 1000];
const welcomePoints = 100;
const welcomeTarget = welcomePoints * 5;
const maxPucks = 100;
const units = 5; // One stored unit is 0.2 points.
/**
 * Призы. kind: physical — выдаёт админ; voucher — можно потратить в приложении (заточка);
 * cosmetic — оформление ника/аватарки на days дней; shout — разовый пост бота в чате.
 * options — выбор игрока (цвет ника, эмодзи).
 */
export const items = [
  { id: 'hockey-stick-150', name: 'Клюшка стоимостью до $150', price: 100_000, icon: '🏒', kind: 'physical' },
  { id: 'skate-sharpening', name: 'Заточка коньков', price: 500, icon: '⛸️', kind: 'voucher' },
  { id: 'hockey-tape', name: 'Хоккейная лента', price: 500, icon: '◉', kind: 'physical' },
  // ачивки на срок: месяц — 30, неделя — 10 (weekPrice)
  { id: 'nick-grad', name: 'Градиентный ник на месяц', price: 30, weekPrice: 10, icon: '🌈', kind: 'cosmetic', period: 'month',
    options: ['sunset', 'gold', 'neon', 'aurora', 'blood'] },
  { id: 'profile-cover', name: 'Обложка профиля на месяц', price: 30, weekPrice: 10, icon: '🖼', kind: 'cosmetic', period: 'month' },
  { id: 'nick-fire', name: 'Огненный ник на месяц', price: 30, weekPrice: 10, icon: '🔥', kind: 'cosmetic', period: 'month' },
  { id: 'nick-color', name: 'Цветной ник на месяц', price: 30, weekPrice: 10, icon: '🎨', kind: 'cosmetic', period: 'month',
    options: ['#ff5a5f', '#ff9f1c', '#ffd23f', '#3ddc84', '#2ec4ff', '#7b61ff', '#ff4fd8'] },
  { id: 'nick-emoji', name: 'Эмодзи у ника на месяц', price: 30, weekPrice: 10, icon: '😎', kind: 'cosmetic', period: 'month',
    options: ['🔥', '🏒', '🥅', '🦅', '⚡', '👑', '🎯', '🧊'] },
  // особая рамка аватарки на выбор: месяц — 30, до конца сезона — 150 (навсегда — за лари в приложении)
  { id: 'frame-month', name: 'Особая рамка на месяц', price: 30, weekPrice: 10, icon: '🖼', kind: 'cosmetic', period: 'month',
    options: ['torch', 'gold', 'ice', 'neon', 'fire', 'falcons', 'rainbow'] },
  { id: 'frame-season', name: 'Особая рамка до конца сезона', price: 150, icon: '🖼', kind: 'cosmetic', period: 'season',
    options: ['torch', 'gold', 'ice', 'neon', 'fire', 'falcons', 'rainbow'] },
  { id: 'shout-out', name: 'Респект в чате', price: 80, icon: '📣', kind: 'shout' },
];
export const hash = seed => createHash('sha256').update(seed).digest('hex');
const newSeed = () => randomBytes(32).toString('hex');
export function openStore(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dir + '/game.sqlite');
  db.exec(`PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS wallet(id INTEGER PRIMARY KEY CHECK(id=1), balance INTEGER NOT NULL CHECK(balance>=0), seed TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS welcome(id INTEGER PRIMARY KEY CHECK(id=1), balance INTEGER NOT NULL CHECK(balance>=0),
      played INTEGER NOT NULL DEFAULT 0, target INTEGER NOT NULL, collected INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS goals(id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS collection(item TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS rounds(commitment TEXT PRIMARY KEY, nonce TEXT NOT NULL, receipt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS purchases(id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT NOT NULL, price INTEGER NOT NULL, option TEXT, at TEXT NOT NULL);`);
  // время бросков и голов — для аналитики (старые записи без времени)
  for (const [t, c] of [['rounds', 'at'], ['goals', 'at']]) {
    if (!db.prepare(`PRAGMA table_info(${t})`).all().some((r) => r.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} TEXT`);
  }
  db.prepare('INSERT OR IGNORE INTO wallet VALUES(1,0,?)').run(newSeed());
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (err) { db.exec('ROLLBACK'); throw err; }
  }
  transaction(() => {
    if (db.prepare('PRAGMA user_version').get().user_version === 0) {
      db.prepare('UPDATE wallet SET balance=balance*?, seed=?').run(units, newSeed());
      db.exec('PRAGMA user_version=1');
    }
  });
  const wallet = () => db.prepare('SELECT balance,seed FROM wallet WHERE id=1').get();
  const readBonus = () => db.prepare('SELECT balance, played, target, collected FROM welcome WHERE id=1').get();
  function bonusStatus(row) {
    if (!row) return 'available';
    if (row.collected) return 'collected';
    if (row.played >= row.target) return 'ready';
    return row.balance < units ? 'spent' : 'active';
  }
  function activate() {
    db.prepare('INSERT OR IGNORE INTO welcome(id,balance,target) VALUES(1,?,?)').run(welcomePoints * units, welcomeTarget);
  }
  function collect() {
    transaction(() => {
      const row = readBonus();
      if (row?.collected) return;
      if (bonusStatus(row) !== 'ready') throw Error('Бонус ещё не разблокирован.');
      db.prepare('UPDATE wallet SET balance=balance+?').run(row.balance);
      db.exec('UPDATE welcome SET balance=0, collected=1');
    });
  }
  function state() {
    const { balance, seed } = wallet();
    const row = readBonus();
    const bonus = { status: bonusStatus(row), amount: welcomePoints, balance: (row?.balance ?? 0) / units,
      played: row?.played ?? 0, target: row?.target ?? welcomeTarget };
    return { bonus, balance: balance / units, commitment: hash(seed), maxPucks, payouts, items,
      owned: db.prepare('SELECT item FROM collection').all().map(r => r.item),
      bought: Object.fromEntries(db.prepare('SELECT item, COUNT(*) c FROM purchases GROUP BY item').all().map(r => [r.item, r.c])),
      last: JSON.parse(db.prepare('SELECT receipt FROM rounds ORDER BY rowid DESC LIMIT 1').get()?.receipt ?? 'null') };
  }
  function goal(id) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw Error('Нужен ID гола (латиница, цифры, дефис).');
    return transaction(() => {
      const { changes } = db.prepare('INSERT OR IGNORE INTO goals(id) VALUES(?)').run(id);
      if (changes) {
        db.prepare('UPDATE goals SET at=? WHERE id=?').run(new Date().toISOString(), id);
        db.prepare('UPDATE wallet SET balance=balance+?').run(units);
      }
      return { credited: !!changes, balance: wallet().balance / units };
    });
  }
  function drop(commitment, nonce, stake = 1, source = 'wallet') {
    if (!['wallet','bonus'].includes(source)) throw Error('Неизвестный баланс.');
    if (!Number.isSafeInteger(stake) || stake < 1) throw Error('Ставка должна быть положительным целым числом.');
    if (stake > maxPucks) throw Error('За один запуск можно бросить до 100 шайб.');
    if (!/^[a-f0-9]{64}$/.test(commitment) || !/^[a-f0-9]{32}$/.test(nonce)) throw Error('Некорректные параметры броска.');
    return transaction(() => {
      const prev = db.prepare('SELECT nonce,receipt FROM rounds WHERE commitment=?').get(commitment);
      if (prev?.nonce === nonce) {
        const receipt = JSON.parse(prev.receipt);
        if ((receipt.stake ?? 1) !== stake || (receipt.source ?? 'wallet') !== source) throw Error('Этот бросок уже принят с другой ставкой.');
        return receipt;
      }
      const account = wallet();
      const seed = account.seed;
      const bonus = source === 'bonus' ? readBonus() : null;
      if (source === 'bonus' && (bonusStatus(bonus) !== 'active' || stake > bonus.target - bonus.played)) {
        throw Error('Проверь остаток бонуса и требуемый оборот.');
      }
      const balance = bonus ? bonus.balance : account.balance;
      if (hash(seed) !== commitment) throw Error('Доска обновилась. Повтори бросок.');
      const cost = stake * units;
      if (balance < cost) throw Error('Ставка превышает баланс.');
      if (!Number.isSafeInteger(balance - cost + cost * Math.max(...payouts))) throw Error('Слишком большая ставка.');
      const pucks = Array.from({length: stake}, (_, index) => {
        const path = createHmac('sha256', seed).update(nonce + ':' + index).digest().readUInt16BE(0);
        const bits = path.toString(2).padStart(16,'0');
        const slot = [...bits].filter(bit => bit === '1').length;
        return { bits, slot, multiplier: payouts[slot] };
      });
      const award = pucks.reduce((sum, puck) => sum + Math.round(units * puck.multiplier), 0);
      const receipt = { seed, commitment, nonce, stake, source, pucks, payout: award / units };
      db.prepare('INSERT INTO rounds(commitment,nonce,receipt,at) VALUES(?,?,?,?)').run(commitment,nonce,JSON.stringify(receipt),new Date().toISOString());
      if (bonus) {
        db.prepare('UPDATE welcome SET balance=?,played=played+?').run(balance - cost + award, stake);
        db.prepare('UPDATE wallet SET seed=?').run(newSeed());
      } else {
        db.prepare('UPDATE wallet SET balance=?,seed=?').run(balance - cost + award, newSeed());
      }
      return receipt;
    });
  }
  /** Покупка: можно брать повторно. Возвращает запись покупки (её id уходит в заказы клуба). */
  /** price — цена из настроек владельца (если он поменял); без неё — из каталога. */
  /** term: 'week' — та же ачивка на 7 дней по weekPrice (только у ачивок на месяц). */
  function buy(id, option = null, priceOverride = null, term = null) {
    let base = items.find(i => i.id === id);
    if (!base) throw Error('Неизвестный предмет.');
    if (term === 'week') {
      if (!base.weekPrice) throw Error('На неделю эту ачивку не взять.');
      base = { ...base, price: base.weekPrice, days: 7, period: 'week', name: base.name.replace('на месяц', 'на неделю') };
    } else if (term != null) throw Error('Неизвестный срок.');
    const item = Number.isSafeInteger(priceOverride) && priceOverride > 0 ? { ...base, price: priceOverride } : base;
    if (item.options && !item.options.includes(option)) throw Error('Выбери вариант.');
    if (!item.options) option = null;
    return transaction(() => {
      if (wallet().balance < item.price * units) throw Error('Недостаточно очков.');
      db.prepare('UPDATE wallet SET balance=balance-?').run(item.price * units);
      db.prepare('INSERT OR IGNORE INTO collection VALUES(?)').run(id);
      const at = new Date().toISOString();
      const r = db.prepare('INSERT INTO purchases(item,price,option,at) VALUES(?,?,?,?)').run(id, item.price, option, at);
      return { purchaseId: Number(r.lastInsertRowid), item, option, at };
    });
  }
  /** Вернуть очки за заказ (админ отменил). */
  function refund(points) {
    db.prepare('UPDATE wallet SET balance=balance+?').run(Math.round(points * units));
  }
  /** Начисление от владельца (отрицательное — списать; ниже нуля баланс не уйдёт). */
  function grant(points) {
    if (!Number.isFinite(points) || points === 0) throw Error('Сколько начислить?');
    return transaction(() => {
      const delta = Math.round(points * units);
      if (wallet().balance + delta < 0) throw Error('Столько у игрока нет.');
      db.prepare('UPDATE wallet SET balance=balance+?').run(delta);
      return wallet().balance / units;
    });
  }
  /** Сводка для аналитики админа. */
  function stats() {
    const rounds = db.prepare('SELECT receipt, at FROM rounds').all().map((r) => ({ ...JSON.parse(r.receipt), at: r.at }));
    const by = (src) => rounds.filter((r) => (r.source ?? 'wallet') === src);
    const sum = (rs, f) => rs.reduce((a, r) => a + f(r), 0);
    const wal = by('wallet'), bon = by('bonus');
    const row = readBonus();
    return {
      balance: wallet().balance / units,
      goals: db.prepare('SELECT COUNT(*) c FROM goals').get().c,
      drops: rounds.length,
      wagered: sum(wal, (r) => r.stake ?? 1),
      won: sum(wal, (r) => r.payout),
      bonusWagered: sum(bon, (r) => r.stake ?? 1),
      bonusWon: sum(bon, (r) => r.payout),
      bonus: { status: bonusStatus(row), played: row?.played ?? 0, collected: !!row?.collected },
      bigWins: rounds.flatMap((r) => (r.pucks ?? []).filter((p) => p.multiplier >= 100).map((p) => ({ multiplier: p.multiplier, at: r.at }))),
      lastPlayed: rounds.map((r) => r.at).filter(Boolean).sort().pop() ?? null,
      purchases: db.prepare('SELECT item, price, option, at FROM purchases ORDER BY id').all(),
    };
  }
  return { state, goal, drop, buy, refund, grant, stats, activate, collect, close: () => db.close() };
}
