import type { FastifyInstance } from 'fastify';
import { issueSession, upsertFromTelegram, verifyLoginWidget } from '../auth.ts';
import { config } from '../config.ts';

/** Публичные маршруты: настройки для экрана входа и вход через Telegram на сайте. */
export default async function authRoutes(app: FastifyInstance) {
  app.get('/api/config', async () => ({
    botUsername: config.botUsername || null,
    devAuth: config.devAuth,
  }));

  app.post<{ Body: Record<string, string | number> }>('/api/auth/telegram', async (req, reply) => {
    const tg = verifyLoginWidget(req.body ?? {});
    if (!tg) return reply.code(401).send({ error: 'Не удалось проверить вход через Telegram' });
    const user = upsertFromTelegram(tg);
    return { token: issueSession(user.id), status: user.status };
  });
}
