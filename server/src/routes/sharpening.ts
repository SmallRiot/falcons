import type { FastifyInstance } from 'fastify';
import { requireActive, requireRole } from '../auth.ts';
import { db, getSetting, nowIso, publicUser, type UserRow } from '../db.ts';
import { markSent } from '../reminders.ts';
import { notifyServiceSharpening, notifySharpening } from '../telegram.ts';
import { readUpload } from '../uploads.ts';

type Status = 'new' | 'accepted' | 'done' | 'rejected';
type Payment = 'unpaid' | 'pending' | 'paid';
interface Row {
  id: number;
  user_id: number;
  status: Status;
  payment: Payment;
  price: number;
}

const price = () => Number(getSetting('sharpening_price', '20'));

export default async function sharpeningRoutes(app: FastifyInstance) {
  /* ---------- игрок ---------- */

  app.get('/api/sharpening', { preHandler: requireActive }, async (req) => ({
    price: price(),
    items: db.prepare('SELECT * FROM sharpenings WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(req.user.id),
  }));

  /** Новая заявка: сразу со скрином оплаты. */
  app.post('/api/sharpening', { preHandler: requireActive }, async (req, reply) => {
    const open = db
      .prepare(`SELECT COUNT(*) c FROM sharpenings WHERE user_id=? AND status IN ('new','accepted')`)
      .get(req.user.id) as { c: number };
    if (open.c >= 2) return reply.code(400).send({ error: 'У вас уже есть активные заявки' });
    const { file, fields } = await readUpload(req);
    if (!file) return reply.code(400).send({ error: 'Прикрепите скрин оплаты' });
    const note = fields.note?.trim().slice(0, 300) || null;
    db.prepare(`INSERT INTO sharpenings(user_id, note, proof, price, payment) VALUES(?,?,?,?, 'pending')`).run(
      req.user.id,
      note,
      file,
      price(),
    );
    void notifyServiceSharpening(req.user, note);
    return { ok: true };
  });

  /** Оплата долга за заточку: прикрепить скрин. */
  app.post<{ Params: { id: string } }>('/api/sharpening/:id/proof', { preHandler: requireActive }, async (req, reply) => {
    const s = db.prepare('SELECT * FROM sharpenings WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.id) as
      | Row
      | undefined;
    if (!s) return reply.code(404).send({ error: 'Заявка не найдена' });
    if (s.payment === 'paid') return reply.code(400).send({ error: 'Уже оплачено' });
    const { file } = await readUpload(req);
    if (!file) return reply.code(400).send({ error: 'Прикрепите скрин оплаты' });
    db.prepare(`UPDATE sharpenings SET proof=?, payment='pending', updated_at=? WHERE id=?`).run(file, nowIso(), s.id);
    void notifyServiceSharpening(req.user, null, true);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/sharpening/:id', { preHandler: requireActive }, async (req, reply) => {
    const r = db
      .prepare(`DELETE FROM sharpenings WHERE id=? AND user_id=? AND status='new' AND payment != 'unpaid'`)
      .run(Number(req.params.id), req.user.id);
    if (!r.changes) return reply.code(400).send({ error: 'Заявку уже взяли в работу' });
    return { ok: true };
  });

  /* ---------- сервис-менеджер ---------- */

  const service = { preHandler: requireRole('service', 'admin') };

  app.get<{ Querystring: { all?: string } }>('/api/service/sharpening', service, async (req) => {
    const rows = db
      .prepare(
        `SELECT s.*, u.first_name, u.last_name, u.username, u.photo_url, u.number, u.position
         FROM sharpenings s JOIN users u ON u.id = s.user_id
         ${
           req.query.all
             ? ''
             : `WHERE s.status IN ('new','accepted') OR (s.payment IN ('unpaid','pending') AND s.status != 'rejected')`
         }
         ORDER BY CASE WHEN s.payment='pending' THEN 0 WHEN s.status='new' THEN 1 WHEN s.status='accepted' THEN 2
                       WHEN s.payment='unpaid' THEN 3 ELSE 4 END, s.id DESC LIMIT 200`,
      )
      .all() as unknown as (UserRow & Row & { note: string; proof: string; comment: string | null; created_at: string; updated_at: string | null })[];
    return rows.map((r) => ({
      id: r.id,
      note: r.note,
      proof: r.proof,
      status: r.status,
      payment: r.payment,
      price: r.price,
      comment: r.comment,
      created_at: r.created_at,
      updated_at: r.updated_at,
      user: publicUser({ ...r, id: r.user_id }),
    }));
  });

  /** Точильщик записывает долг: наточил, а деньги не пришли. */
  app.post<{ Body: { user_id: number; note?: string; price?: number } }>(
    '/api/service/sharpening/debt',
    service,
    async (req, reply) => {
      const uid = Number(req.body?.user_id);
      const u = db.prepare(`SELECT * FROM users WHERE id=? AND status='active'`).get(uid) as UserRow | undefined;
      if (!u) return reply.code(404).send({ error: 'Игрок не найден' });
      const amount = Number(req.body.price) > 0 ? Number(req.body.price) : price();
      db.prepare(
        `INSERT INTO sharpenings(user_id, note, price, status, payment, handled_by, updated_at) VALUES(?,?,?, 'done', 'unpaid', ?, ?)`,
      ).run(uid, req.body.note?.trim() || null, amount, req.user.id, nowIso());
      void notifySharpening(uid, 'debt', { amount, comment: req.body.note?.trim() });
      markSent(`debt:sharp:${uid}`);
      return { ok: true };
    },
  );

  app.patch<{ Params: { id: string }; Body: { status?: Status; payment?: Payment; comment?: string } }>(
    '/api/service/sharpening/:id',
    service,
    async (req, reply) => {
      const s = db.prepare('SELECT * FROM sharpenings WHERE id = ?').get(Number(req.params.id)) as Row | undefined;
      if (!s) return reply.code(404).send({ error: 'Заявка не найдена' });
      const b = req.body ?? {};
      if (b.status && !['new', 'accepted', 'done', 'rejected'].includes(b.status))
        return reply.code(400).send({ error: 'Неверный статус' });
      if (b.payment && !['unpaid', 'pending', 'paid'].includes(b.payment))
        return reply.code(400).send({ error: 'Неверный статус оплаты' });
      const status = b.status ?? s.status;
      // «Оплата ок, беру» — принимаем и оплату
      const payment = b.payment ?? (b.status === 'accepted' && s.payment === 'pending' ? 'paid' : s.payment);
      db.prepare('UPDATE sharpenings SET status=?, payment=?, comment=?, handled_by=?, updated_at=? WHERE id=?').run(
        status,
        payment,
        b.comment?.trim() || null,
        req.user.id,
        nowIso(),
        s.id,
      );
      const c = b.comment?.trim();
      if (status !== s.status && (status === 'accepted' || status === 'done' || status === 'rejected'))
        void notifySharpening(s.user_id, status, { comment: c });
      if (payment !== s.payment) {
        if (payment === 'unpaid') {
          void notifySharpening(s.user_id, 'unpaid', { amount: s.price, comment: c });
          markSent(`debt:sharp:${s.user_id}`);
        }
        if (payment === 'paid' && status === s.status) void notifySharpening(s.user_id, 'paid');
      }
      return { ok: true };
    },
  );
}
