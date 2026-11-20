import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@shared/api';
import { language, t } from '@shared/i18n';

interface RinkFrame extends HTMLIFrameElement {
  arcadeRequest?: (path: string, body?: unknown) => Promise<unknown>;
  /** игра просит открыть экран приложения (например, оплату рамки навсегда) */
  arcadeOpen?: (path: string) => void;
}

const ALLOWED_OPEN = ['/frame-forever', '/profile'];

export default function Rink() {
  const nav = useNavigate();
  const connect = useCallback(
    (frame: RinkFrame | null) => {
      if (!frame) return;
      frame.arcadeRequest = (path, body) => {
        switch (path) {
          case '/state': return api.get('/api/arcade/state');
          case '/drop': return api.post('/api/arcade/drop', body);
          case '/welcome': return api.post('/api/arcade/welcome', {});
          case '/collect': return api.post('/api/arcade/collect', {});
          case '/buy': return api.post('/api/arcade/buy', body);
          default: return Promise.reject(new Error('Unknown rink action'));
        }
      };
      frame.arcadeOpen = (path) => {
        if (ALLOWED_OPEN.includes(path)) nav(path);
      };
    },
    [nav],
  );
  return <iframe lang={language} className="rink-frame" ref={connect} title={t('Ледовый дроп')} src="/api/rink/assets/index.html" />;
}
