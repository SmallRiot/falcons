import { t } from '@shared/i18n';
import { useEffect, useState } from 'react';
import { Clock, FlaskConical, ShieldX, WifiOff } from 'lucide-react';
import { api, setDevUser, type Me, type Role } from '@shared/api';
import { inTelegram } from '@shared/tg';
import { Sheet, Spinner } from '@shared/ui';
import { ROLE_LABEL } from '@shared/format';

type Props = {
  kind: 'pending' | 'rejected' | 'error';
  me?: Me;
  message?: string;
  onRetry: () => void;
  onDev: () => void;
  devOpen: boolean;
  setDevOpen: (v: boolean) => void;
};

export default function Gate({ kind, me, message, onRetry, onDev, devOpen, setDevOpen }: Props) {
  const content = {
    pending: {
      icon: <Clock size={18} />,
      title: t('Заявка отправлена'),
      text: t('{0}, админ команды получил уведомление. Как только тебя пустят — придёт сообщение от бота.', me?.user.first_name ?? ''),
    },
    rejected: { icon: <ShieldX size={18} />, title: t('Доступ закрыт'), text: t('Если это ошибка — напиши админу команды.') },
    error: { icon: <WifiOff size={18} />, title: t('Не получилось войти'), text: message ?? t('Попробуй ещё раз') },
  }[kind];
  return (
    <div className="gate">
      <img className="logo" src="/logo.png" alt="Falcons" />
      <h1>{content.title}</h1>
      <p>{content.text}</p>
      <button className="btn secondary" onClick={onRetry}>
        {t('Проверить ещё раз')}
      </button>
      {!inTelegram && (
        <button className="btn ghost sm" onClick={onDev}>
          <FlaskConical size={16} /> {t('Сменить тестового пользователя')}
        </button>
      )}
      <Sheet open={devOpen} onClose={() => setDevOpen(false)} title={t('Войти как…')}>
        <DevPicker embedded onPick={() => location.reload()} />
      </Sheet>
    </div>
  );
}

interface DevUser {
  id: number;
  name: string;
  roles: Role[];
  status: string;
}

/** Только для теста в браузере (DEV_AUTH=1 на сервере). */
export function DevPicker({ onPick, embedded }: { onPick: () => void; embedded?: boolean }) {
  const [users, setUsers] = useState<DevUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.get<DevUser[]>('/api/dev/users').then(setUsers, (e) => setErr(e.message));
  }, []);

  const list = (
    <div className="list" style={{ width: '100%', textAlign: 'left' }}>
      {users?.map((u) => (
        <button
          key={u.id}
          className="row"
          onClick={() => {
            setDevUser(u.id);
            onPick();
          }}
        >
          <div className="grow">
            <div className="title">{u.name}</div>
            <div className="meta">
              id {u.id}
              {u.status !== 'active' ? ` · ${u.status === 'pending' ? t('Ожидает') : t('Доступ закрыт')}` : ''}
            </div>
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
  );

  if (embedded) return err ? <p className="muted">{err}</p> : users ? list : <Spinner />;

  return (
    <div className="gate" style={{ justifyContent: 'flex-start', paddingTop: 48 }}>
      <img className="logo" src="/logo.png" alt="Falcons" />
      <h1>Falcons</h1>
      <p>
        {t('Тестовый режим в браузере. Выбери, под кем зайти — у ролей разные экраны.')}
      </p>
      {err ? (
        <div className="alert warn" style={{ textAlign: 'left' }}>
          <div className="body">
            <b>{t('Dev-вход выключен')}</b>
            {t('Включи')} <code>DEV_AUTH=1</code> {t('в .env и запусти')} <code>npm run seed</code>{t(', либо открой приложение из Telegram.')}
          </div>
        </div>
      ) : users ? (
        list
      ) : (
        <Spinner />
      )}
    </div>
  );
}
