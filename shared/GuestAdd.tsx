import { t } from './i18n';
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api, type PublicUser } from './api';
import { Segmented, useAction, useApi } from './ui';

/**
 * Записать гостя на событие: имя (+ позиция) или выбрать из недавних гостей.
 * Гость попадает в «Идут» и в пятёрки, бот ему не пишет.
 */
export function GuestAdd({ eventId, already, onAdded }: { eventId: number; already: number[]; onAdded: () => Promise<unknown> }) {
  const recent = useApi<PublicUser[]>('/api/guests');
  const [name, setName] = useState('');
  const [pos, setPos] = useState<'F' | 'D' | 'G'>('F');
  const [club, setClub] = useState('');
  const { busy, run } = useAction();
  const add = (body: { name?: string; guest_id?: number; position?: string; club?: string }, who: string) =>
    run(async () => {
      await api.post(`/api/events/${eventId}/guests`, body);
      setName('');
      setClub('');
      await Promise.all([onAdded(), recent.reload()]);
    }, t('{0} записан', who));
  const quick = (recent.data ?? []).filter((g) => !already.includes(g.id));

  return (
    <div className="form">
      <label className="field">
        <span>{t('Имя гостя')}</span>
        <input
          className="input"
          autoFocus
          value={name}
          placeholder={t('Например: Олег Смирнов')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim().length > 1 && add({ name, position: pos, club }, name.trim())}
        />
      </label>
      <label className="field">
        <span>{t('Из какой команды')}</span>
        <input className="input" maxLength={40} value={club} placeholder={t('Например: Барсы. Пусто — просто гость')} onChange={(e) => setClub(e.target.value)} />
      </label>
      <div className="field">
        <span>{t('Позиция')}</span>
        <Segmented
          value={pos}
          onChange={setPos}
          options={[
            ['F', t('Нападающий')],
            ['D', t('Защитник')],
            ['G', t('Вратарь')],
          ]}
        />
      </div>
      <button className="btn block" disabled={busy || name.trim().length < 2} onClick={() => add({ name, position: pos, club }, name.trim())}>
        <UserPlus size={18} /> {t('Записать гостя')}
      </button>
      {quick.length > 0 && (
        <div className="field">
          <span>{t('Недавние гости — в один тап')}</span>
          <div className="chips">
            {quick.map((g) => (
              <button key={g.id} className="chip" style={{ border: 0, height: 34, padding: '0 12px' }} disabled={busy} onClick={() => add({ guest_id: g.id }, g.name)}>
                + {g.name}{g.tags?.find((x) => x.guest && x.label !== 'Гость') ? ` · ${g.tags.find((x) => x.guest)!.label}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="muted small">{t('Гость появится в «Идут» и в пятёрках. Бот ему не пишет, в списке игроков и взносах его нет.')}</div>
    </div>
  );
}
