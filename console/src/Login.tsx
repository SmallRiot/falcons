import { useEffect, useRef, useState } from 'react';
import { api, setDevUser, setSession, type Role } from '@shared/api';
import { ROLE_LABEL } from '@shared/format';
import { Spinner, toastErr } from '@shared/ui';

interface Cfg {
  botUsername: string | null;
  devAuth: boolean;
}
interface DevUser {
  id: number;
  name: string;
  roles: Role[];
  status: string;
}

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string | number>) => void;
  }
}

/** Вход в консоль: официальный виджет «Войти через Telegram» (+ тестовые пользователи при DEV_AUTH=1). */
export default function Login({ onDone }: { onDone: () => void }) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [dev, setDev] = useState<DevUser[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<Cfg>('/api/config').then(setCfg, () => setCfg({ botUsername: null, devAuth: false }));
  }, []);
  useEffect(() => {
    if (cfg?.devAuth) api.get<DevUser[]>('/api/dev/users').then((u) => setDev(u.filter((x) => x.roles.some((r) => r === 'admin' || r === 'coach'))));
  }, [cfg]);

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
    s.setAttribute('data-request-access', 'write');
    s.setAttribute('data-onauth', 'onTelegramAuth(user)');
    box.current.innerHTML = '';
    box.current.appendChild(s);
  }, [cfg, onDone]);

  if (!cfg) return <Spinner />;
  return (
    <div className="login">
      <div className="login-art">
        <img src="/logo.png" alt="Falcons" />
      </div>
      <div className="login-form">
        <div className="small" style={{ color: 'var(--falcon)', fontWeight: 750, letterSpacing: '0.1em' }}>
          FALCONS · КОНСОЛЬ
        </div>
        <h1>Управление командой</h1>
        <p className="muted" style={{ margin: 0 }}>
          Расписание, пятёрки, посещаемость, взносы. Только для админов и тренера — игроки пользуются мини-приложением в Telegram.
        </p>
        {cfg.botUsername ? (
          <div ref={box} style={{ minHeight: 48 }} />
        ) : (
          <div className="alert warn">
            <div className="body">Бот не подключён: задай BOT_TOKEN на сервере.</div>
          </div>
        )}
        <p className="muted small" style={{ margin: 0 }}>
          Для входа через Telegram домен консоли должен быть привязан к боту: @BotFather → /setdomain.
        </p>
        {cfg.devAuth && dev.length > 0 && (
          <>
            <div className="section-title" style={{ margin: '12px 0 0' }}>
              Тестовый вход
            </div>
            <div className="list">
              {dev.map((u) => (
                <button
                  key={u.id}
                  className="row"
                  onClick={() => {
                    setDevUser(u.id);
                    onDone();
                  }}
                >
                  <div className="grow">
                    <div className="title">{u.name}</div>
                  </div>
                  <div className="chips">
                    {u.roles.map((r) => (
                      <span key={r} className="chip info">
                        {ROLE_LABEL[r]}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
