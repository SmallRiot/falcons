import { mkdirSync } from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(import.meta.dirname, '../../.env');
try {
  process.loadEnvFile(envPath);
} catch {
  /* .env не обязателен */
}

const list = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 8787),
  dataDir: path.resolve(import.meta.dirname, '../..', process.env.DATA_DIR ?? './data'),
  devAuth: process.env.DEV_AUTH === '1',
  botToken: process.env.BOT_TOKEN ?? '',
  botUsername: process.env.BOT_USERNAME ?? '',
  appShortName: process.env.APP_SHORT_NAME ?? '',
  webappUrl: process.env.WEBAPP_URL ?? '',
  teamChatId: process.env.TEAM_CHAT_ID ?? '',
  adminIds: list(process.env.ADMIN_IDS).map(Number),
  botPolling: process.env.BOT_POLLING === '1',
  tz: 'Asia/Tbilisi',
};

export const uploadsDir = path.join(config.dataDir, 'uploads');
mkdirSync(uploadsDir, { recursive: true });
