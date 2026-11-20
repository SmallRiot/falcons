import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Мини-приложение для игроков (Telegram). Общий дизайн и код — в ../shared.
export default defineConfig({
  plugins: [react()],
  publicDir: path.resolve(__dirname, '../shared/public'),
  resolve: { alias: { '@shared': path.resolve(__dirname, '../shared') } },
  server: {
    host: true,
    port: 5180,
    strictPort: true,
    fs: { allow: [path.resolve(__dirname, '..')] },
    proxy: { '/api': 'http://localhost:8787' },
  },
});
