import type { FastifyInstance } from 'fastify';
import { requireActive, requireRole } from '../auth.ts';
import { db, nowIso, publicUser, type UserRow } from '../db.ts';
import { getEvent, type GuestFee } from '../signup.ts';
import { notifyAdminsGuestFee, notifyGuestFeeResult } from '../telegram.ts';
import { readUpload } from '../uploads.ts';

/** Гости платят за каждый выход на лёд: скрин → админ проверяет. */
export default async function feeRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>('/api/fees/:id/proof', { preHandler: requireActive }, async (req, reply) => {
    const f = db.prepare('SELECT * FROM guest_fees WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id) as GuestFee | undefined;
    if (!f) return reply.code(404).send({ error: 'Оплата не найдена' });
    if (f.status === 'paid') return reply.code(400).send({ error: 'Уже оплачено' });
    const { file, fields } = await readUpload(req);
    if (!file) return reply.code(400).send({ error: 'Прикрепите скрин оплаты' });
    db.prepare(`UPDATE guest_fees SET proof = ?, status = 'pending', comment = ?, updated_at = ? WHERE id = ?`).run(
      file,
      fields.comment?.trim() || null,
      nowIso(),
      f.id,
    );
    const e = getEvent(f.event_id);
    if (e) void notifyAdminsGuestFee(req.user, e, f.amount);
    return { ok: true };
  });

  const admin = { preHandler: requireRole('admin') };

  app.get('/api/admin/fees', admin, async () => {
    const rows = db
      .prepare(
        `SELECT f.*, e.type AS e_type, e.title AS e_title, e.starts_at AS e_starts_at, u.*,
                f.id AS fee_id, f.status AS fee_status, f.created_at AS fee_created_at
         FROM guest_fees f JOIN events e ON e.id = f.event_id JOIN users u ON u.id = f.user_id
         WHERE e.cancelled = 0
         ORDER BY CASE f.status WHEN 'pending' THEN 0 WHEN 'unpaid' THEN 1 ELSE 2 END, e.starts_at DESC LIMIT 300`,
      )
      .all() as unknown as (UserRow & GuestFee & { e_type: string; e_title: string | null; e_starts_at: string; fee_id: number; fee_status: GuestFee['status']; fee_created_at: string })[];
    return rows.map((r) => ({
      id: r.fee_id,
      amount: r.amount,
      status: r.fee_status,
      proof: r.proof,
      comment: r.comment,
      created_at: r.fee_created_at,
      event: { id: r.event_id, type: r.e_type, title: r.e_title, starts_at: r.e_starts_at },
      user: publicUser({ ...r, id: r.user_id, status: 'active' } as UserRow),
    }));
  });

  app.patch<{ Params: { id: string }; Body: { status: 'paid' | 'unpaid'; comment?: string } }>('/api/admin/fees/:id', admin, async (req, reply) => {
    const f = db.prepare('SELECT * FROM guest_fees WHERE id = ?').get(Number(req.params.id)) as GuestFee | undefined;
    if (!f) return reply.code(404).send({ error: 'Оплата не найдена' });
    const status = req.body?.status === 'paid' ? 'paid' : 'unpaid';
    db.prepare('UPDATE guest_fees SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), f.id);
    const e = getEvent(f.event_id);
    if (e && status !== f.status) void notifyGuestFeeResult(f.user_id, e, status === 'paid', req.body?.comment?.trim());
    return { ok: true };
  });
}
