import { t } from '@shared/i18n';
import { useState } from 'react';
import { api } from '@shared/api';
import { Segmented, Sheet, useAction, useMe } from '@shared/ui';

/** Первый вход после одобрения: имя, фамилия, дата рождения (+ номер и позиция). Закрыть нельзя, пока не заполнено. */
export default function Onboarding() {
  const { me, refresh } = useMe();
  const u = me.user;
  const [f, setF] = useState({
    first_name: u.first_name ?? '',
    last_name: u.last_name ?? '',
    birth_date: u.birth_date ?? '',
    number: u.number != null ? String(u.number) : '',
    position: (u.position ?? 'F') as 'F' | 'D' | 'G',
  });
  const { busy, run } = useAction();
  const ok = f.first_name.trim() && f.last_name.trim() && f.birth_date;
  return (
    <Sheet open onClose={() => {}}>
      <div className="vstack center" style={{ alignItems: 'center', gap: 6, paddingTop: 4 }}>
        <img src="/logo.png" alt="" style={{ width: 64, height: 64 }} />
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>{t('Добро пожаловать в Falcons!')}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {t('Заполни профиль — так тренер узнает тебя в составе, а в день рождения команда поздравит в чате 🎂')}
        </p>
      </div>
      <div className="form">
        <div className="form-row">
          <label className="field">
            <span>{t('Имя')}</span>
            <input className="input" value={f.first_name} autoComplete="given-name" onChange={(e) => setF({ ...f, first_name: e.target.value })} />
          </label>
          <label className="field">
            <span>{t('Фамилия')}</span>
            <input className="input" value={f.last_name} autoComplete="family-name" onChange={(e) => setF({ ...f, last_name: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>{t('Дата рождения')}</span>
          <input className="input" type="date" value={f.birth_date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, birth_date: e.target.value })} />
        </label>
        <div className="form-row">
          <label className="field" style={{ maxWidth: 120 }}>
            <span>{t('Номер')}</span>
            <input className="input" inputMode="numeric" maxLength={2} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value.replace(/\D/g, '') })} />
          </label>
          <div className="field">
            <span>{t('Позиция')}</span>
            <Segmented value={f.position} onChange={(v) => setF({ ...f, position: v })} options={[['F', t('Нап')], ['D', t('Защ')], ['G', t('Врт')]]} />
          </div>
        </div>
        <button
          className="btn block"
          disabled={busy || !ok}
          onClick={() =>
            run(async () => {
              await api.patch('/api/me', { ...f, number: f.number === '' ? null : Number(f.number) });
              await refresh();
            }, t('Профиль заполнен 🦅'))
          }
        >
          {t('Готово')}
        </button>
      </div>
    </Sheet>
  );
}
