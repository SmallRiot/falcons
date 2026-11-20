import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config.ts';
import { authenticate } from './auth.ts';
import { resolveBotUsername, startPolling } from './telegram.ts';
import { startReminders } from './reminders.ts';
import meRoutes from './routes/me.ts';
import eventRoutes from './routes/events.ts';
import financeRoutes from './routes/finance.ts';
import sharpeningRoutes from './routes/sharpening.ts';
import adminRoutes from './routes/admin.ts';
import devRoutes from './routes/dev.ts';
import authRoutes from './routes/auth.ts';
import consoleRoutes from './routes/console.ts';

/**
 * Два фронта — два порта, одно API и одна база:
 *  PORT          — мини-приложение для игроков (web/dist) + API
 *  CONSOLE_PORT  — веб-консоль для админов и тренера (console/dist) + то же API
 * В разработке фронты крутит Vite (5180 и 5181), а сюда проксирует /api.
 */
async function buildServer(staticDir: string | null) {
  const app = Fastify({ logger: { level: 'warn' } });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  if (config.devAuth) await app.register(devRoutes);
  await app.register(authRoutes);
  await app.register(async (api) => {
    api.addHook('preHandler', authenticate);
    await api.register(meRoutes);
    await api.register(eventRoutes);
    await api.register(financeRoutes);
    await api.register(sharpeningRoutes);
    await api.register(adminRoutes);
    await api.register(consoleRoutes);
  });
  app.get('/healthz', async () => ({ ok: true }));
  if (staticDir && existsSync(staticDir)) {
    await app.register(fastifyStatic, { root: staticDir });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'),
    );
  }
  return app;
}

if (config.devAuth) console.warn('⚠️  DEV_AUTH=1 — вход без Telegram включён. Не используйте в проде.');
await resolveBotUsername();
if (config.testChatId) console.warn(`🧪 TEST_CHAT_ID задан — все сообщения бота уходят на ${config.testChatId}`);

const root = path.resolve(import.meta.dirname, '../..');
const mini = await buildServer(path.join(root, 'web/dist'));
await mini.listen({ port: config.port, host: '0.0.0.0' });
console.log(`🦅 Мини-приложение + API: http://localhost:${config.port}`);

const consoleDist = path.join(root, 'console/dist');
if (existsSync(consoleDist)) {
  const cons = await buildServer(consoleDist);
  await cons.listen({ port: config.consolePort, host: '0.0.0.0' });
  console.log(`🖥  Консоль + API: http://localhost:${config.consolePort}`);
}

void startPolling();
startReminders();
