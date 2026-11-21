import type { FastifyInstance } from 'fastify';
import { requireActive, requireOwner, requireRole } from '../auth.ts';
import { db, displayName, nowIso, publicUser, resetStyleCache, type UserRow } from '../db.ts';
import { arcadePlayers, buyPrize, catalog, FOREVER, FRAME_DESIGNS, grantPoints, setShopOverride, withStore, type PrizeOrder, type ShopOverride } from '../prizes.ts';
import { readUpload } from '../uploads.ts';

const FOREVER_PRICE = 50; // ₾
import { botSay, BOT_TOPICS, notifyOwnerForeverFrame, notifyOwnerTroll, notifyPrizeStatus, notifyTrollStarted, teamChatIdNow, type BotTopic } from '../telegram.ts';
import { activeTrolls, allFacts, runDailyMemory, TROLL_DAYS, TROLL_PRICE } from '../troll.ts';
import { aiStats, runDailyVkid } from '../aiBuddy.ts';

export default async function arcadeRoutes(app: FastifyInstance) {
  const player = { preHandler: requireActive };

  // витрина: каталог с правками владельца (цены, скрытые цены, снятое с продажи)
  const withCatalog = <T,>(st: T) => ({ ...(st as object), items: catalog() }) as T;
  app.get('/api/arcade/state', player, (req) => withCatalog(withStore(req.user.id, (store) => store.state())));

  app.post('/api/arcade/welcome', player, (req) =>
    withStore(req.user.id, (store) => {
      store.activate();
      return { state: store.state() };
    }),
  );
  app.post('/api/arcade/collect', player, (req, reply) =>
    withStore(req.user.id, (store) => {
      try {
        store.collect();
        return { state: store.state() };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }),
  );

  app.post<{ Body: { commitment: string; nonce: string; stake: number; source?: string; rows: number } }>(
    '/api/arcade/drop',
    {
      ...player,
      schema: {
        body: {
          type: 'object',
          required: ['commitment', 'nonce', 'stake', 'rows'],
          properties: {
            commitment: { type: 'string', pattern: '^[a-f0-9]{64}$' },
            nonce: { type: 'string', pattern: '^[a-f0-9]{32}$' },
            stake: { type: 'integer', minimum: 1, maximum: 100 },
            source: { type: 'string', enum: ['wallet', 'bonus'] },
            rows: { type: 'integer', const: 16 },
          },
        },
      },
    },
    (req, reply) =>
      withStore(req.user.id, (store) => {
        const { commitment, nonce, stake } = req.body;
        try {
          const receipt = store.drop(commitment, nonce, stake, req.body.source);
          return { state: withCatalog(store.state()), receipt };
        } catch (err) {
          return reply.code(400).send({ error: (err as Error).message });
        }
      }),
  );

  /** Покупка: заказ попадает в базу клуба, админу приходит уведомление, приз — в профиль игрока. */
  app.post<{ Body: { id: string; option?: string; term?: 'week' } }>(
    '/api/arcade/buy',
    {
      ...player,
      schema: {
        body: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', maxLength: 32 }, option: { type: 'string', maxLength: 16 }, term: { type: 'string', enum: ['week'] } },
        },
      },
    },
    (req, reply) => {
      try {
        const order = buyPrize(req.user, req.body.id, req.body.option ?? null, req.body.term ?? null);
        return { state: withCatalog(withStore(req.user.id, (s) => s.state())), order };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  /** Особая рамка навсегда — за 50 ₾ переводом: скрин → владелец подтверждает → рамка включается навсегда. */
  app.post('/api/frames/forever', player, async (req, reply) => {
    const { file, fields } = await readUpload(req);
    const design = fields.design;
    if (!FRAME_DESIGNS.includes(design)) return reply.code(400).send({ error: 'Выбери рамку' });
    if (!file) return reply.code(400).send({ error: 'Прикрепи скрин перевода' });
    const r = db
      .prepare(
        `INSERT INTO prize_orders(user_id, item, title, kind, price, option, status, proof, currency) VALUES(?, 'frame-forever', 'Особая рамка навсегда', 'cosmetic', ?, ?, 'awaiting', ?, 'gel')`,
      )
      .run(req.user.id, FOREVER_PRICE, design, file);
    void notifyOwnerForeverFrame(req.user, design);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });
  app.get('/api/frames/forever', player, () => ({ price: FOREVER_PRICE, designs: FRAME_DESIGNS }));

  /** Бот-тролль на неделю — за деньги переводом: цель, досье, анонимно или нет → скрин → владелец подтверждает. */
  app.get('/api/troll', player, (req) => ({
    price: TROLL_PRICE,
    days: TROLL_DAYS,
    players: (db.prepare(`SELECT * FROM users WHERE status = 'active' AND id != ? ORDER BY first_name`).all(req.user.id) as unknown as UserRow[]).map(publicUser),
    active: activeTrolls().map((t) => ({ target_id: t.target_id, expires_at: t.expires_at })),
  }));
  app.post('/api/troll', player, async (req, reply) => {
    const { file, fields } = await readUpload(req);
    const target = db.prepare(`SELECT * FROM users WHERE id = ? AND status = 'active'`).get(Number(fields.target)) as UserRow | undefined;
    const dossier = (fields.dossier ?? '').trim();
    const anon = fields.anon === '1';
    if (!target) return reply.code(400).send({ error: 'Выбери, кого троллить' });
    if (target.id === req.user.id) return reply.code(400).send({ error: 'Себя троллить — это к психологу 🙃' });
    if (dossier.length < 10) return reply.code(400).send({ error: 'Расскажи про него хоть пару строк — за что цеплять' });
    if (dossier.length > 2000) return reply.code(400).send({ error: 'Досье слишком длинное — до 2000 символов' });
    if (!file) return reply.code(400).send({ error: 'Прикрепи скрин перевода' });
    const title = `Бот-тролль на ${displayName(target)}`;
    const r = db
      .prepare(`INSERT INTO prize_orders(user_id, item, title, kind, price, option, status, proof, currency) VALUES(?, 'troll', ?, 'troll', ?, ?, 'awaiting', ?, 'gel')`)
      .run(req.user.id, title, TROLL_PRICE, anon ? 'анонимно' : 'от своего имени', file);
    const orderId = Number(r.lastInsertRowid);
    db.prepare('INSERT INTO trolls(order_id, target_id, dossier, anon) VALUES(?,?,?,?)').run(orderId, target.id, dossier, anon ? 1 : 0);
    void notifyOwnerTroll(req.user, target, anon);
    return { ok: true, id: orderId };
  });

  /* ---------- призы игрока ---------- */

  app.get('/api/me/prizes', player, (req) =>
    db.prepare(`SELECT * FROM prize_orders WHERE user_id = ? AND status != 'cancelled' ORDER BY id DESC LIMIT 100`).all(req.user.id),
  );

  /* ---------- админ: аналитика и выдача ---------- */

  // игрой и магазином управляет только владелец (первый админ)
  const admin = { preHandler: requireOwner };

  app.get('/api/admin/arcade', admin, () => {
    const users = new Map((db.prepare('SELECT * FROM users').all() as unknown as UserRow[]).map((u) => [u.id, u]));
    const players = arcadePlayers().map((id) => {
      const st = withStore(id, (s) => s.stats());
      const u = users.get(id);
      return { user: u ? publicUser(u) : { id, name: `id ${id}` }, ...st, purchases: st.purchases.length, spent: st.purchases.reduce((a, p) => a + p.price, 0) };
    });
    const orders = (db.prepare('SELECT * FROM prize_orders ORDER BY id DESC LIMIT 300').all() as unknown as PrizeOrder[]).map((o) => {
      const u = users.get(o.user_id);
      return { ...o, user: u ? publicUser(u) : { id: o.user_id, name: `id ${o.user_id}` } };
    });
    const sum = (f: (p: (typeof players)[number]) => number) => players.reduce((a, p) => a + f(p), 0);
    const byItem: Record<string, { title: string; count: number; points: number }> = {};
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      byItem[o.item] ??= { title: o.title, count: 0, points: 0 };
      byItem[o.item].count++;
      byItem[o.item].points += o.price;
    }
    const wagered = sum((p) => p.wagered);
    const won = sum((p) => p.won);
    return {
      totals: {
        players: players.length,
        active7: players.filter((p) => p.lastPlayed && Date.now() - Date.parse(p.lastPlayed) < 7 * 864e5).length,
        goals: sum((p) => p.goals),
        balances: sum((p) => p.balance),
        drops: sum((p) => p.drops),
        wagered,
        won,
        rtp: wagered ? won / wagered : null,
        bonusActivated: players.filter((p) => p.bonus.status !== 'available').length,
        bonusCollected: players.filter((p) => p.bonus.collected).length,
        bonusWagered: sum((p) => p.bonusWagered),
        spent: sum((p) => p.spent),
        orders: orders.filter((o) => o.status !== 'cancelled').length,
        toIssue: orders.filter((o) => o.kind === 'physical' && o.status === 'new').length,
        bigWins: players.flatMap((p) => p.bigWins.map((w) => ({ ...w, user: p.user }))).sort((a, b) => b.multiplier - a.multiplier).slice(0, 10),
      },
      byItem: Object.entries(byItem).map(([item, v]) => ({ item, ...v })).sort((a, b) => b.points - a.points),
      players: players.sort((a, b) => b.balance - a.balance),
      // все участники — кому можно начислить очки (у кого ещё нет кошелька — баланс 0)
      members: [...users.values()]
        .filter((u) => u.status === 'active')
        .map((u) => ({ user: publicUser(u), balance: players.find((p) => p.user.id === u.id)?.balance ?? 0 }))
        .sort((a, b) => String(a.user.name).localeCompare(String(b.user.name), 'ru')),
      grants: (db.prepare('SELECT * FROM point_grants ORDER BY id DESC LIMIT 50').all() as { user_id: number; points: number; note: string | null; at: string }[]).map(
        (g) => ({ ...g, user: users.has(g.user_id) ? publicUser(users.get(g.user_id)!) : { id: g.user_id, name: `id ${g.user_id}` } }),
      ),
      orders,
      ai: aiStats(),
    };
  });

  /** Владелец: каталог магазина с правками и смена цены / скрытой цены / «в продаже». */
  app.get('/api/admin/shop', admin, () => catalog(true));
  app.put<{ Params: { id: string }; Body: ShopOverride }>('/api/admin/shop/:id', admin, (req, reply) => {
    try {
      const b = req.body ?? {};
      setShopOverride(req.params.id, {
        ...(b.price !== undefined ? { price: Number(b.price) } : {}),
        ...(b.weekPrice !== undefined ? { weekPrice: Number(b.weekPrice) } : {}),
        ...(b.hidden !== undefined ? { hidden: !!b.hidden } : {}),
        ...(b.off !== undefined ? { off: !!b.off } : {}),
      });
      return catalog(true);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  /** Владелец начисляет очки игроку (минус — списать). */
  app.post<{ Body: { userId: number; points: number; note?: string } }>(
    '/api/admin/arcade/grant',
    {
      ...admin,
      schema: {
        body: {
          type: 'object',
          required: ['userId', 'points'],
          properties: { userId: { type: 'integer' }, points: { type: 'number', minimum: -100000, maximum: 100000 }, note: { type: 'string', maxLength: 120 } },
        },
      },
    },
    (req, reply) => {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.body.userId) as UserRow | undefined;
      if (!u || u.status !== 'active') return reply.code(404).send({ error: 'Игрок не найден' });
      const points = Math.round(req.body.points * 5) / 5;
      try {
        const balance = grantPoints(req.user, u, points, req.body.note?.trim() || null);
        return { ok: true, balance };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  /** Админ: вечерний вкид прямо сейчас (проверить, как пишет нейронка). */
  app.post('/api/admin/ai/vkid', admin, async () => {
    await runDailyVkid(true);
    return { ok: true };
  });

  /** Админ: физический приз выдан / отменить заказ (очки возвращаются в игру). */
  app.patch<{ Params: { id: string }; Body: { status: 'issued' | 'cancelled' | 'approved' } }>('/api/admin/prizes/:id', admin, (req, reply) => {
    const o = db.prepare('SELECT * FROM prize_orders WHERE id = ?').get(Number(req.params.id)) as PrizeOrder | undefined;
    if (!o) return reply.code(404).send({ error: 'Заказ не найден' });
    const st = req.body?.status;
    if (st === 'approved') {
      if (o.status !== 'awaiting') return reply.code(400).send({ error: 'Этот заказ не ждёт подтверждения' });
      if (o.item === 'troll') {
        const tr = db.prepare('SELECT * FROM trolls WHERE order_id = ?').get(o.id) as { target_id: number; anon: number } | undefined;
        const target = tr && (db.prepare('SELECT * FROM users WHERE id = ?').get(tr.target_id) as UserRow | undefined);
        if (!tr || !target) return reply.code(400).send({ error: 'Цель тролля не найдена' });
        // уже идёт тролль на него — неделя добавляется к концу
        const until = activeTrolls(tr.target_id).reduce((m, t) => Math.max(m, Date.parse(t.expires_at)), Date.now());
        const expires = new Date(until + TROLL_DAYS * 864e5).toISOString();
        db.prepare(`UPDATE prize_orders SET status = 'active', expires_at = ?, done_at = ? WHERE id = ?`).run(expires, nowIso(), o.id);
        const buyer = db.prepare('SELECT * FROM users WHERE id = ?').get(o.user_id) as UserRow | undefined;
        void botSay(
          `🧌 На ${displayName(target)}${target.username ? ` (@${target.username})` : ''} спущен бот-тролль на неделю.\n${tr.anon || !buyer ? 'Заказчик пожелал остаться неизвестным 🤫' : `Заказал: ${displayName(buyer)}`}`,
          { topic: 'general' },
        );
        void notifyTrollStarted(o.user_id, target, expires);
        return { ok: true };
      }
      db.prepare(`UPDATE prize_orders SET status = 'active', expires_at = ?, done_at = ? WHERE id = ?`).run(FOREVER, nowIso(), o.id);
      resetStyleCache();
      void notifyPrizeStatus(o.user_id, o.title, 'issued');
    } else if (st === 'issued') {
      if (o.kind !== 'physical' || o.status !== 'new') return reply.code(400).send({ error: 'Этот заказ не ждёт выдачи' });
      db.prepare(`UPDATE prize_orders SET status = 'issued', done_at = ? WHERE id = ?`).run(nowIso(), o.id);
      void notifyPrizeStatus(o.user_id, o.title, 'issued');
    } else if (st === 'cancelled') {
      if (['cancelled', 'used', 'issued', 'done'].includes(o.status)) return reply.code(400).send({ error: 'Этот заказ уже нельзя отменить' });
      db.prepare(`UPDATE prize_orders SET status = 'cancelled', done_at = ? WHERE id = ?`).run(nowIso(), o.id);
      // очки возвращаем в игру; деньги за рамку навсегда возвращаются вручную
      if ((o as PrizeOrder & { currency?: string }).currency !== 'gel') withStore(o.user_id, (s) => s.refund(o.price));
      resetStyleCache();
      void notifyPrizeStatus(o.user_id, o.title, 'cancelled', (o as PrizeOrder & { currency?: string }).currency === 'gel' ? undefined : o.price);
    } else return reply.code(400).send({ error: 'Неизвестный статус' });
    return { ok: true };
  });

  /* ---------- память бота и тролли (владелец) ---------- */
  app.get('/api/admin/ai/memory', admin, () => ({
    facts: allFacts(),
    totalChat: (db.prepare('SELECT COUNT(*) c FROM chat_log').get() as { c: number }).c,
    unread: (
      db
        .prepare(`SELECT COUNT(*) c FROM chat_log WHERE id > COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'memory_last_id'), 0)`)
        .get() as { c: number }
    ).c,
    trolls: activeTrolls().map((t) => {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(t.target_id) as UserRow | undefined;
      const b = db.prepare('SELECT * FROM users WHERE id = ?').get(t.buyer_id) as UserRow | undefined;
      return { ...t, target: u ? publicUser(u) : null, buyer: b ? publicUser(b) : null };
    }),
  }));
  app.post('/api/admin/ai/memory', admin, async () => runDailyMemory(true));
  app.delete<{ Params: { id: string } }>('/api/admin/ai/facts/:id', admin, (req) => {
    db.prepare('DELETE FROM ai_facts WHERE id = ?').run(Number(req.params.id));
    return { ok: true };
  });

  /* ---------- написать в группу от имени бота (все админы) ---------- */
  const anyAdmin = { preHandler: requireRole('admin') };
  app.get('/api/admin/bot/chat', anyAdmin, () => ({
    topics: BOT_TOPICS,
    connected: !!teamChatIdNow(),
    messages: (
      db
        .prepare('SELECT id, user_id, name, text, at, thread_id FROM chat_log WHERE chat_id = ? AND message_id IS NOT NULL ORDER BY id DESC LIMIT 40')
        .all(String(teamChatIdNow())) as { id: number }[]
    ),
  }));
  app.post<{ Body: { text: string; topic?: BotTopic; replyTo?: number } }>(
    '/api/admin/bot/say',
    {
      ...anyAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['text'],
          properties: { text: { type: 'string', minLength: 1, maxLength: 3000 }, topic: { type: 'string', enum: Object.keys(BOT_TOPICS) }, replyTo: { type: 'integer' } },
        },
      },
    },
    async (req, reply) => {
      if (!teamChatIdNow()) return reply.code(400).send({ error: 'Бот не подключён к командному чату' });
      let replyTo: { messageId: number; threadId: number | null } | undefined;
      if (req.body.replyTo) {
        const m = db.prepare('SELECT message_id, thread_id FROM chat_log WHERE id = ?').get(req.body.replyTo) as { message_id: number | null; thread_id: number | null } | undefined;
        if (!m?.message_id) return reply.code(400).send({ error: 'Это сообщение не найти' });
        replyTo = { messageId: m.message_id, threadId: m.thread_id };
      }
      const r = await botSay(req.body.text.trim(), { topic: req.body.topic ?? 'general', replyTo });
      if (!r && teamChatIdNow()) return reply.code(502).send({ error: 'Telegram не принял сообщение' });
      return { ok: true };
    },
  );
}
