import type { FastifyInstance } from 'fastify';
import { requireActive, requireRole } from '../auth.ts';
import { db, getSetting, hasRole, nowIso, publicUser, setSetting, type UserRow } from '../db.ts';
import { amountFor, computeRates, ensureDues, lockPeriod, setPlan, type DueRow, type Period, type Plan } from '../finance.ts';
import {
  notifyAdminsProof,
  notifyChoosePlanLate,
  notifyCollectionStarted,
  notifyDueAmount,
  notifyDuePaid,
  notifyDueRejected,
  notifyDueSetByAdmin,
  notifyPollOpened,
  postDebtorsList,
  refreshPollPost,
} from '../telegram.ts';
import { readUpload } from '../uploads.ts';
import { squadIdsOf } from '../squads.ts';
import { markSent, runReminders } from '../reminders.ts';

const getPeriod = (id: number) => db.prepare('SELECT * FROM periods WHERE id = ?').get(id) as Period | undefined;

export default async function financeRoutes(app: FastifyInstance) {
  /* ---------- игрок ---------- */

  app.get('/api/finance', { preHandler: requireActive }, async (req) => {
    const periods = db.prepare('SELECT * FROM periods ORDER BY month DESC LIMIT 12').all() as unknown as Period[];
    const items = periods.map((p) => {
      ensureDues(p.id);
      const d = db.prepare('SELECT * FROM dues WHERE period_id = ? AND user_id = ?').get(p.id, req.user.id) as
        | DueRow
        | undefined;
      const rates = computeRates(p);
      const locked = !!p.locked;
      // Игрокам не показываем, сколько собираем: без бюджета и общей суммы.
      // До старта сбора нет и ставок — только расклад голосов.
      const { budget: _b, ...period } = p;
      const { total: _t, ...pub } = rates;
      return {
        period: { ...period, locked },
        rates: locked ? pub : { ...pub, full: null, partial: null },
        due: d ? { ...d, amount: locked ? amountFor(p, d, rates) : null } : null,
      };
    });
    const accounts = db.prepare(`SELECT * FROM accounts ORDER BY sort, id`).all();
    return { items, accounts, sharpeningPrice: Number(getSetting('sharpening_price', '20')) };
  });

  app.post<{ Params: { id: string }; Body: { plan: Plan } }>(
    '/api/finance/:id/plan',
    { preHandler: requireActive },
    async (req, reply) => {
      const p = getPeriod(Number(req.params.id));
      if (!p) return reply.code(404).send({ error: 'Период не найден' });
      const err = setPlan(p, req.user.id, req.body?.plan);
      if (err) return reply.code(400).send({ error: err });
      refreshPollPost(p.id);
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>('/api/finance/:id/proof', { preHandler: requireActive }, async (req, reply) => {
    const p = getPeriod(Number(req.params.id));
    if (!p) return reply.code(404).send({ error: 'Период не найден' });
    ensureDues(p.id);
    const d = db.prepare('SELECT * FROM dues WHERE period_id = ? AND user_id = ?').get(p.id, req.user.id) as unknown as DueRow;
    if (!d.plan && d.custom_amount == null) return reply.code(400).send({ error: 'Сначала выберите вариант взноса' });
    if (!p.locked) return reply.code(400).send({ error: 'Сбор ещё не начался — дождитесь итоговой суммы' });
    if (d.status === 'paid') return reply.code(400).send({ error: 'Уже оплачено' });
    const { file, fields } = await readUpload(req);
    if (!file) {
      // админ сам принимает деньги — свою оплату может отметить без скрина
      if (!hasRole(req.user, 'admin')) return reply.code(400).send({ error: 'Прикрепите скрин оплаты' });
      db.prepare(
        `UPDATE dues SET status = 'paid', submitted_at = ?, comment = ?, reviewed_by = ?, reviewed_at = ? WHERE period_id = ? AND user_id = ?`,
      ).run(nowIso(), fields.comment?.trim() || 'Без скрина (админ)', req.user.id, nowIso(), p.id, req.user.id);
      return { ok: true, paid: true };
    }
    db.prepare(
      `UPDATE dues SET proof = ?, status = 'pending', submitted_at = ?, comment = ? WHERE period_id = ? AND user_id = ?`,
    ).run(file, nowIso(), fields.comment?.trim() || null, p.id, req.user.id);
    void notifyAdminsProof(req.user, p.month, amountFor(p, d));
    return { ok: true };
  });

  app.get('/api/accounts', { preHandler: requireActive }, async () =>
    db.prepare('SELECT * FROM accounts ORDER BY sort, id').all(),
  );

  /* ---------- админ ---------- */

  const admin = { preHandler: requireRole('admin') };

  app.get('/api/admin/periods', admin, async () => {
    const periods = db.prepare('SELECT * FROM periods ORDER BY month DESC').all() as unknown as Period[];
    return periods.map((p) => {
      const agg = db
        .prepare(
          `SELECT d.status, COUNT(*) c FROM dues d JOIN users u ON u.id=d.user_id
           WHERE d.period_id = ? AND u.status='active' GROUP BY d.status`,
        )
        .all(p.id) as { status: string; c: number }[];
      const by = Object.fromEntries(agg.map((a) => [a.status, a.c]));
      return { ...p, locked: !!p.locked, rates: computeRates(p), counts: by };
    });
  });

  app.post<{ Body: { month: string; budget: number; partial_ratio?: number; donation_amount?: number; due_date?: string; notify?: boolean } }>(
    '/api/admin/periods',
    admin,
    async (req, reply) => {
      const b = req.body ?? ({} as never);
      if (!/^\d{4}-\d{2}$/.test(b.month ?? '')) return reply.code(400).send({ error: 'Месяц в формате ГГГГ-ММ' });
      if (!(Number(b.budget) > 0)) return reply.code(400).send({ error: 'Укажите бюджет' });
      if (db.prepare('SELECT 1 FROM periods WHERE month = ?').get(b.month))
        return reply.code(400).send({ error: 'Такой месяц уже есть' });
      const r = db
        .prepare('INSERT INTO periods(month, budget, partial_ratio, donation_amount, due_date) VALUES(?,?,?,?,?)')
        .run(b.month, Number(b.budget), Number(b.partial_ratio ?? 0.7), Number(b.donation_amount ?? 100), b.due_date || null);
      const id = Number(r.lastInsertRowid);
      ensureDues(id);
      // переносим выбор прошлого месяца, чтобы не выбирать заново
      const prev = db.prepare('SELECT id FROM periods WHERE month < ? ORDER BY month DESC LIMIT 1').get(b.month) as
        | { id: number }
        | undefined;
      if (prev)
        db.prepare(
          `UPDATE dues SET plan = (SELECT plan FROM dues p WHERE p.period_id = ? AND p.user_id = dues.user_id)
           WHERE period_id = ? AND plan IS NULL`,
        ).run(prev.id, id);
      if (b.notify !== false) void notifyPollOpened(getPeriod(id)!);
      return getPeriod(id);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<Period> & { locked?: boolean | number } }>(
    '/api/admin/periods/:id',
    admin,
    async (req, reply) => {
      const p = getPeriod(Number(req.params.id));
      if (!p) return reply.code(404).send({ error: 'Период не найден' });
      const b = req.body ?? {};
      db.prepare('UPDATE periods SET budget=?, partial_ratio=?, donation_amount=?, due_date=? WHERE id=?').run(
        Number(b.budget ?? p.budget),
        Number(b.partial_ratio ?? p.partial_ratio),
        Number(b.donation_amount ?? p.donation_amount),
        b.due_date !== undefined ? b.due_date || null : p.due_date,
        p.id,
      );
      if (b.locked !== undefined) {
        if (b.locked && !p.locked) {
          // «Начать сбор»: фиксируем суммы, каждому — личное сообщение с его суммой, в чат — общий пост
          const rates = lockPeriod(getPeriod(p.id)!);
          const rows = db
            .prepare(
              `SELECT d.user_id, d.plan, d.amount, d.custom_amount FROM dues d JOIN users u ON u.id = d.user_id
               WHERE d.period_id = ? AND u.status = 'active' AND d.status IN ('unpaid','rejected')`,
            )
            .all(p.id) as { user_id: number; plan: string | null; amount: number | null; custom_amount: number | null }[];
          for (const d of rows) {
            if (!d.plan && d.custom_amount == null) {
              void notifyChoosePlanLate(d.user_id, p.month);
              continue;
            }
            if ((d.amount ?? 0) <= 0) continue;
            void notifyDueAmount(d.user_id, p.month, d.custom_amount != null ? null : d.plan, d.amount!);
            markSent(`debt:dues:${d.user_id}`);
          }
          void notifyCollectionStarted(p, rates);
        }
        refreshPollPost(p.id);
        if (!b.locked && p.locked) db.prepare('UPDATE periods SET locked = 0 WHERE id = ?').run(p.id);
      }
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string } }>('/api/admin/periods/:id', admin, async (req, reply) => {
    const p = getPeriod(Number(req.params.id));
    if (!p) return reply.code(404).send({ error: 'Период не найден' });
    ensureDues(p.id);
    const rates = computeRates(p);
    const rows = db
      .prepare(
        `SELECT d.*, u.id uid, u.first_name, u.last_name, u.username, u.photo_url, u.number, u.position, u.signup_blocked
         FROM dues d JOIN users u ON u.id = d.user_id WHERE d.period_id = ? AND u.status='active'
         ORDER BY CASE d.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 WHEN 'unpaid' THEN 2 ELSE 3 END, u.first_name`,
      )
      .all(p.id) as unknown as (DueRow & UserRow & { uid: number })[];
    return {
      period: { ...p, locked: !!p.locked },
      rates,
      dues: rows.map((r) => ({
        user: { ...publicUser({ ...r, id: r.uid }), signup_blocked: !!r.signup_blocked, squads: squadIdsOf(r.uid) },
        plan: r.plan,
        custom_amount: r.custom_amount,
        amount: amountFor(p, r, rates),
        status: r.status,
        proof: r.proof,
        comment: r.comment,
        submitted_at: r.submitted_at,
      })),
    };
  });

  app.patch<{
    Params: { id: string; userId: string };
    Body: { plan?: Plan | null; custom_amount?: number | null; status?: DueRow['status']; comment?: string };
  }>('/api/admin/periods/:id/dues/:userId', admin, async (req, reply) => {
    const p = getPeriod(Number(req.params.id));
    if (!p) return reply.code(404).send({ error: 'Период не найден' });
    const uid = Number(req.params.userId);
    ensureDues(p.id);
    const d = db.prepare('SELECT * FROM dues WHERE period_id=? AND user_id=?').get(p.id, uid) as DueRow | undefined;
    if (!d) return reply.code(404).send({ error: 'Нет такой записи' });
    const b = req.body ?? {};
    const plan = b.plan !== undefined ? b.plan : d.plan;
    const custom = b.custom_amount !== undefined ? (b.custom_amount === null ? null : Number(b.custom_amount)) : d.custom_amount;
    const status = b.status ?? d.status;
    db.prepare(
      `UPDATE dues SET plan=?, custom_amount=?, status=?, comment=?, reviewed_by=?, reviewed_at=? WHERE period_id=? AND user_id=?`,
    ).run(
      plan,
      custom,
      status,
      b.comment !== undefined ? b.comment || null : d.comment,
      b.status ? req.user.id : d.reviewed_by,
      b.status ? nowIso() : d.reviewed_at,
      p.id,
      uid,
    );
    // при зафиксированном периоде пересчитываем сумму этого человека
    if (p.locked && (b.plan !== undefined || b.custom_amount !== undefined)) {
      const nd = db.prepare('SELECT * FROM dues WHERE period_id=? AND user_id=?').get(p.id, uid) as unknown as DueRow;
      const rates = computeRates(p);
      db.prepare('UPDATE dues SET amount=? WHERE period_id=? AND user_id=?').run(
        amountFor({ ...p, locked: 0 }, nd, rates),
        p.id,
        uid,
      );
    }
    if (b.plan !== undefined || b.custom_amount !== undefined) {
      const nd = db.prepare('SELECT plan, custom_amount, amount, status FROM dues WHERE period_id=? AND user_id=?').get(p.id, uid) as unknown as DueRow;
      const changed = nd.plan !== d.plan || nd.custom_amount !== d.custom_amount;
      if (changed && nd.status !== 'paid')
        void notifyDueSetByAdmin(uid, p.month, nd.custom_amount != null ? null : nd.plan, p.locked ? nd.amount : nd.custom_amount, !!p.locked);
    }
    if (b.plan !== undefined) refreshPollPost(p.id);
    if (b.status && b.status !== d.status) {
      if (b.status === 'paid') {
        void notifyDuePaid(uid, p.month);
        // разблокируем запись, если долгов больше нет
        const left = db
          .prepare(
            `SELECT COUNT(*) c FROM dues d JOIN periods p ON p.id=d.period_id
             WHERE d.user_id=? AND p.locked=1 AND d.status IN ('unpaid','rejected') AND COALESCE(d.amount,0)>0`,
          )
          .get(uid) as { c: number };
        if (!left.c) db.prepare('UPDATE users SET signup_blocked = 0 WHERE id = ?').run(uid);
      }
      if (b.status === 'rejected') void notifyDueRejected(uid, p.month, b.comment);
    }
    return { ok: true };
  });

  /** Таблица должников месяца — в командный чат. */
  app.post<{ Params: { id: string } }>('/api/admin/periods/:id/debtors-post', admin, async (req, reply) => {
    const p = getPeriod(Number(req.params.id));
    if (!p) return reply.code(404).send({ error: 'Период не найден' });
    if (!p.locked) return reply.code(400).send({ error: 'Сбор ещё не начат' });
    const rows = db
      .prepare(
        `SELECT u.first_name, u.last_name, d.amount FROM dues d JOIN users u ON u.id = d.user_id
         WHERE d.period_id = ? AND u.status = 'active' AND d.status IN ('unpaid','rejected') AND COALESCE(d.amount,0) > 0
         ORDER BY u.last_name, u.first_name`,
      )
      .all(p.id) as { first_name: string; last_name: string | null; amount: number }[];
    if (!rows.length) return reply.code(400).send({ error: 'Должников нет 🎉' });
    void postDebtorsList(p.month, rows.map((r) => ({ name: [r.first_name, r.last_name].filter(Boolean).join(' '), amount: r.amount })));
    return { posted: rows.length };
  });

  /** Разослать напоминания должникам прямо сейчас. */
  app.post('/api/admin/remind', admin, async () => ({ sent: await runReminders(true) }));

  /** Закрыть запись всем, у кого есть долг. */
  app.post('/api/admin/block-debtors', admin, async () => {
    const r = db
      .prepare(
        `UPDATE users SET signup_blocked = 1 WHERE status='active' AND id IN (
           SELECT d.user_id FROM dues d JOIN periods p ON p.id=d.period_id
           WHERE p.locked=1 AND d.status IN ('unpaid','rejected') AND COALESCE(d.amount,0)>0)`,
      )
      .run();
    return { blocked: r.changes };
  });

  /* ---------- счета ---------- */

  interface AccountBody {
    bank: string;
    holder: string;
    iban: string;
    purpose?: string;
    pay_url?: string;
    note?: string;
    sort?: number;
  }
  // Счёт = ФИО получателя + IBAN. Банк определяем по IBAN (GE00 TB… → TBC).
  const IBAN_BANK: Record<string, string> = { TB: 'TBC', BG: 'BOG', LB: 'Liberty', CD: 'Credo', BS: 'Basis', PC: 'ProCredit', HS: 'Halyk', TR: 'Tera' };
  const clean = (b: AccountBody) => {
    const iban = (b.iban ?? '').replace(/\s+/g, '').toUpperCase();
    return [
      IBAN_BANK[iban.slice(4, 6)] ?? 'Банк',
      b.holder?.trim(),
      iban,
      b.purpose === 'sharpening' ? 'sharpening' : 'dues',
      null,
      null,
      Number(b.sort ?? 0),
    ] as const;
  };
  const check = (v: ReturnType<typeof clean>) =>
    !v[1] ? 'Укажите ФИО получателя' : !/^GE\d{2}[A-Z]{2}\d{16}$/.test(v[2]) ? 'IBAN выглядит неверно: GE + 20 символов, например GE29TB7000000000000000' : null;

  app.post<{ Body: AccountBody }>('/api/admin/accounts', admin, async (req, reply) => {
    const v = clean(req.body ?? ({} as AccountBody));
    const err = check(v);
    if (err) return reply.code(400).send({ error: err });
    db.prepare('INSERT INTO accounts(bank, holder, iban, purpose, pay_url, note, sort) VALUES(?,?,?,?,?,?,?)').run(...v);
    return { ok: true };
  });
  app.put<{ Params: { id: string }; Body: AccountBody }>('/api/admin/accounts/:id', admin, async (req, reply) => {
    const v = clean(req.body ?? ({} as AccountBody));
    const err = check(v);
    if (err) return reply.code(400).send({ error: err });
    db.prepare('UPDATE accounts SET bank=?, holder=?, iban=?, purpose=?, pay_url=?, note=?, sort=? WHERE id=?').run(
      ...v,
      Number(req.params.id),
    );
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>('/api/admin/accounts/:id', admin, async (req) => {
    db.prepare('DELETE FROM accounts WHERE id = ?').run(Number(req.params.id));
    return { ok: true };
  });

  app.put<{ Body: { sharpening_price: number } }>('/api/admin/settings', admin, async (req) => {
    if (req.body?.sharpening_price != null) setSetting('sharpening_price', String(Number(req.body.sharpening_price)));
    return { ok: true };
  });
}
