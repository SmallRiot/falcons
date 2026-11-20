import { db } from './db.ts';

export type Plan = 'full' | 'partial' | 'donation' | 'exempt';

export interface Period {
  id: number;
  month: string;
  budget: number;
  partial_ratio: number;
  donation_amount: number;
  locked: number;
  locked_full: number | null;
  locked_partial: number | null;
  due_date: string | null;
  created_at: string;
}

export interface DueRow {
  period_id: number;
  user_id: number;
  plan: Plan | null;
  amount: number | null;
  custom_amount: number | null;
  status: 'unpaid' | 'pending' | 'paid' | 'rejected';
  proof: string | null;
  comment: string | null;
  submitted_at: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
}

/**
 * Делим бюджет: полный взнос F, частичный = ratio·F, донат — фиксированный.
 * budget = nFull·F + nPartial·ratio·F + Σdonation + Σcustom  →  F.
 * Округляем вверх до 5 лари, чтобы точно хватило.
 */
export function computeRates(period: Period) {
  const rows = db
    .prepare(
      `SELECT d.plan, d.custom_amount FROM dues d JOIN users u ON u.id = d.user_id
       WHERE d.period_id = ? AND u.status = 'active'`,
    )
    .all(period.id) as { plan: Plan | null; custom_amount: number | null }[];
  let nFull = 0,
    nPartial = 0,
    nDonation = 0,
    nUndecided = 0,
    fixed = 0;
  for (const r of rows) {
    if (r.custom_amount != null) {
      fixed += r.custom_amount;
      continue;
    }
    if (r.plan === 'full') nFull++;
    else if (r.plan === 'partial') nPartial++;
    else if (r.plan === 'donation') {
      nDonation++;
      fixed += period.donation_amount;
    } else if (!r.plan) nUndecided++;
  }
  const units = nFull + nPartial * period.partial_ratio;
  const rest = Math.max(0, period.budget - fixed);
  const round5 = (x: number) => Math.ceil(x / 5) * 5;
  const full = units > 0 ? round5(rest / units) : 0;
  const partial = round5(full * period.partial_ratio);
  const total = nFull * full + nPartial * partial + fixed;
  if (period.locked && period.locked_full != null) {
    // после старта сбора показываем зафиксированные ставки
    const lf = period.locked_full, lp = period.locked_partial ?? partial;
    return { full: lf, partial: lp, donation: period.donation_amount, nFull, nPartial, nDonation, nUndecided, total: nFull * lf + nPartial * lp + fixed };
  }
  return { full, partial, donation: period.donation_amount, nFull, nPartial, nDonation, nUndecided, total };
}

export function amountFor(period: Period, due: Pick<DueRow, 'plan' | 'custom_amount' | 'amount'>, rates = computeRates(period)) {
  if (due.custom_amount != null) return due.custom_amount;
  if (period.locked && due.amount != null) return due.amount;
  // после старта сбора ставки берём зафиксированные (для тех, кто выбрал поздно)
  const full = period.locked && period.locked_full != null ? period.locked_full : rates.full;
  const partial = period.locked && period.locked_partial != null ? period.locked_partial : rates.partial;
  switch (due.plan) {
    case 'full':
      return full;
    case 'partial':
      return partial;
    case 'donation':
      return rates.donation;
    case 'exempt':
      return 0;
    default:
      return null;
  }
}

/** Фиксирует суммы у всех при закрытии периода. */
export function lockPeriod(period: Period) {
  const rates = computeRates(period);
  const dues = db.prepare('SELECT * FROM dues WHERE period_id = ?').all(period.id) as unknown as DueRow[];
  const upd = db.prepare('UPDATE dues SET amount = ? WHERE period_id = ? AND user_id = ?');
  for (const d of dues) upd.run(amountFor({ ...period, locked: 0 }, d, rates), period.id, d.user_id);
  db.prepare('UPDATE periods SET locked = 1, locked_full = ?, locked_partial = ? WHERE id = ?').run(rates.full, rates.partial, period.id);
  return rates;
}

/**
 * Выбор варианта игроком — из приложения или кнопкой в чате. Возвращает текст ошибки или null.
 * До старта сбора менять можно сколько угодно; после — только если ещё не выбирал.
 */
export function setPlan(period: Period, userId: number, plan: Plan): string | null {
  if (!['full', 'partial', 'donation'].includes(plan)) return 'Неизвестный вариант';
  ensureDues(period.id);
  const d = db.prepare('SELECT * FROM dues WHERE period_id = ? AND user_id = ?').get(period.id, userId) as DueRow | undefined;
  if (!d) return 'Доступ ещё не открыт';
  if (period.locked) {
    if (d.plan || d.custom_amount != null) return 'Сбор уже идёт — поменять вариант может только админ';
    const amount = amountFor(period, { plan, custom_amount: null, amount: null });
    db.prepare('UPDATE dues SET plan = ?, amount = ? WHERE period_id = ? AND user_id = ?').run(plan, amount, period.id, userId);
    return null;
  }
  if (d.status === 'paid' || d.status === 'pending') return 'Оплата уже отправлена — поменять вариант может только админ';
  db.prepare('UPDATE dues SET plan = ? WHERE period_id = ? AND user_id = ?').run(plan, period.id, userId);
  return null;
}

/** Создаёт строки dues для всех активных игроков, у кого их нет. */
export function ensureDues(periodId: number) {
  db.prepare(
    `INSERT OR IGNORE INTO dues(period_id, user_id) SELECT ?, id FROM users WHERE status = 'active'`,
  ).run(periodId);
}

export function debtsOf(userId: number) {
  return db
    .prepare(
      `SELECT p.id AS period_id, p.month, d.amount, d.status, d.comment
       FROM dues d JOIN periods p ON p.id = d.period_id
       WHERE d.user_id = ? AND p.locked = 1 AND d.status IN ('unpaid','rejected') AND COALESCE(d.amount,0) > 0
       ORDER BY p.month`,
    )
    .all(userId) as { period_id: number; month: string; amount: number; status: string; comment: string | null }[];
}
