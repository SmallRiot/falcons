import { t } from './i18n';
import { useEffect, useState } from 'react';
import { api, type PublicUser } from './api';
import { PhotoEdit } from './PhotoEdit';
import { Segmented, useAction } from './ui';

type Pos = 'F' | 'D' | 'G';

/** Правка игрока админом: фото, имя, фамилия, номер, позиция, дата рождения. Общая для мини-приложения и консоли. */
export function PlayerEdit({ user, onSaved }: { user: PublicUser; onSaved: () => Promise<unknown> }) {
  const init = () => ({
    first_name: user.first_name ?? '',
    last_name: user.last_name ?? '',
    number: user.number != null ? String(user.number) : '',
    position: (user.position ?? 'F') as Pos,
    birth_date: user.birth_date ?? '',
  });
  const [f, setF] = useState(init);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setF(init()), [user.id]);
  const { busy, run } = useAction();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(init());

  const save = () =>
    run(async () => {
      await api.patch(`/api/admin/users/${user.id}`, {
        first_name: f.first_name,
        last_name: f.last_name,
        number: f.number === '' ? null : Number(f.number),
        position: f.position,
        birth_date: f.birth_date || null,
      });
      await onSaved();
    }, t('Профиль игрока сохранён'));

  return (
    <div className="form">
      <PhotoEdit user={user} endpoint={`/api/admin/users/${user.id}/photo`} onChange={onSaved} />
      <div className="form-row">
        <label className="field">
          <span>{t('Имя')}</span>
          <input className="input" value={f.first_name} onChange={(e) => set('first_name', e.target.value)} />
        </label>
        <label className="field">
          <span>{t('Фамилия')}</span>
          <input className="input" value={f.last_name} onChange={(e) => set('last_name', e.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label className="field" style={{ maxWidth: 110 }}>
          <span>{t('Номер')}</span>
          <input className="input" inputMode="numeric" value={f.number} onChange={(e) => set('number', e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </label>
        <label className="field">
          <span>{t('Дата рождения')}</span>
          <input className="input" type="date" value={f.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
        </label>
      </div>
      <div className="field">
        <span>{t('Позиция')}</span>
        <Segmented
          value={f.position}
          onChange={(v) => set('position', v)}
          options={[
            ['F', t('Нападающий')],
            ['D', t('Защитник')],
            ['G', t('Вратарь')],
          ]}
        />
      </div>
      <button className="btn block" disabled={busy || !dirty || !f.first_name.trim()} onClick={save}>
        {t('Сохранить профиль')}
      </button>
    </div>
  );
}
