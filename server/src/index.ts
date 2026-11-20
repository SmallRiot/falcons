import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config.ts';
import { authenticate } from './auth.ts';
import { startPolling } from './telegram.ts';
import { startReminders } from './reminders.ts';
import meRoutes from './routes/me.ts';
import eventRoutes from './routes/events.ts';
import financeRoutes from './routes/finance.ts';
import sharpeningRoutes from './routes/sharpening.ts';
import adminRoutes from './routes/admin.ts';
import devRoutes from './routes/dev.ts';
import authRoutes from './routes/auth.ts';

const app = Fastify({ logger: { level: 'warn' } });

await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

if (config.devAuth) {
  console.warn('⚠️  DEV_AUTH=1 — вход без Telegram включён. Не используйте в проде.');
  await app.register(devRoutes);
}

await app.register(authRoutes);

await app.register(async (api) => {
  api.addHook('preHandler', authenticate);
  await api.register(meRoutes);
  await api.register(eventRoutes);
  await api.register(financeRoutes);
  await api.register(sharpeningRoutes);
  await api.register(adminRoutes);
});

app.get('/healthz', async () => ({ ok: true }));

// в проде отдаём собранный фронт
const webDist = path.resolve(import.meta.dirname, '../../web/dist');
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'),
  );
}

await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`🦅 Falcons API на http://localhost:${config.port}`);
void startPolling();
startReminders();
