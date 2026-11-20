import { useEffect, useRef, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { api, setSession } from '../api';
import { Spinner, toastErr } from '../ui';
import { DevPicker } from './Gate';

interface Cfg {
  botUsername: string | null;
  devAuth: boolean;
}

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string | number>) => void;
  }
}

/** Вход на сайте: официальный виджет «Войти через Telegram». */
export default function Login({ onDone }: { onDone: () => void }) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [showDev, setShowDev] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<Cfg>('/api/config').then(setCfg, () => setCfg({ botUsername: null, devAuth: false }));
  }, []);

  useEffect(() => {
    if (!cfg?.botUsername || !box.current) return;
    window.onTelegramAuth = async (user) => {
      try {
        const r = await api.post<{ token: string }>('/api/auth/telegram', user);
        setSession(r.token);
        onDone();
      } catch (e) {
        toastErr(e);
      }
    };
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.async = true;
    s.setAttribute('data-telegram-login', cfg.botUsername);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-radius', '14');
    s.setAttribute('data-request-access', 'write'); // чтобы бот мог писать в личку
    s.setAttribute('data-onauth', 'onTelegramAuth(user)');
    box.current.innerHTML = '';
    box.current.appendChild(s);
  }, [cfg, onDone]);

  if (!cfg) return <Spinner />;

  return (
    <div className="gate" style={{ justifyContent: showDev ? 'flex-start' : 'center', paddingTop: showDev ? 48 : 32 }}>
      <img className="logo" src="/logo.png" alt="Falcons" />
      <h1>Falcons</h1>
      <p>Запись на лёд, пятёрки, взносы и заточка. Войди через Telegram — тот же аккаунт, что и в мини-приложении.</p>
      {cfg.botUsername ? (
        <div ref={box} style={{ minHeight: 48 }} />
      ) : (
        <div className="alert warn" style={{ textAlign: 'left' }}>
          <div className="body">
            <b>Бот ещё не подключён</b>
            Укажи BOT_TOKEN и BOT_USERNAME в .env и привяжи домен сайта к боту в @BotFather (/setdomain).
          </div>
        </div>
      )}
      {cfg.devAuth &&
        (showDev ? (
          <DevPicker embedded onPick={onDone} />
        ) : (
          <button className="btn ghost sm" onClick={() => setShowDev(true)}>
            <FlaskConical size={16} /> Тестовый вход
          </button>
        ))}
    </div>
  );
}
