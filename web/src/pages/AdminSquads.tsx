import { t } from '@shared/i18n';
import { useState } from 'react';
import { Plus, Shield } from 'lucide-react';
import { api, type Squad } from '@shared/api';
import { ask, Empty, Sheet, Spinner, useAction, useApi, useMe } from '@shared/ui';

const COLORS = ['#2b88cf', '#1f9d6b', '#c98612', '#8a4fd8', '#d64545', '#0d1f2d'];
const EMPTY = { name: '', short: '', color: COLORS[0], division: '', sort: 0 };

export default function AdminSquads() {
  const { refresh } = useMe();
  const { data, loading, reload } = useApi<Squad[]>('/api/squads');
  const roster = useApi<{ id: number; squads: number[] }[]>('/api/roster');
  const [edit, setEdit] = useState<(typeof EMPTY & { id?: number }) | null>(null);
  const { busy, run } = useAction();
  if (loading) return <Spinner />;
  const count = (id: number) => (roster.data ?? []).filter((u) => u.squads.includes(id)).length;
  const save = () =>
    run(async () => {
      const body = { ...edit, division: edit!.division ? Number(edit!.division) : null };
      if (edit!.id) await api.put(`/api/admin/squads/${edit!.id}`, body);
      else await api.post('/api/admin/squads', body);
      await Promise.all([reload(), refresh()]);
      setEdit(null);
    }, t('Сохранено'));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('Составы')}</h1>
          <div className="sub">{t('Для игр. Тренировки — общие для всех.')}</div>
        </div>
        <button className="btn sm" onClick={() => setEdit({ ...EMPTY })}>
          <Plus size={16} /> {t('Состав')}
        </button>
      </div>
      {!data?.length ? (
        <Empty icon={<Shield size={26} />} title={t('Составов нет')} />
      ) : (
        <div className="list">
          {data.map((s) => (
            <button key={s.id} className="row" onClick={() => setEdit({ ...s, division: s.division ? String(s.division) : '' })}>
              <span className="avatar" style={{ background: s.color, fontSize: 12 }}>
                {s.short}
              </span>
              <div className="grow">
                <div className="title">{s.name}</div>
                <div className="meta">
                  {s.division ? t('{0} дивизион · ', s.division) : ''}
                  {count(s.id)} {t('игроков')}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="muted small" style={{ padding: '0 4px' }}>
        {t('Игрок может играть сразу за несколько составов — отметь их в «Люди и роли». Он увидит игры всех своих составов.')}
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('Состав') : t('Новый состав')}>
        {edit && (
          <div className="form">
            <label className="field">
              <span>{t('Название')}</span>
              <input className="input" value={edit.name} placeholder="Falcons" onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <div className="form-row">
              <label className="field">
                <span>{t('Метка (до 8 символов)')}</span>
                <input className="input" value={edit.short} maxLength={8} placeholder={t('Д1')} onChange={(e) => setEdit({ ...edit, short: e.target.value })} />
              </label>
              <label className="field">
                <span>{t('Дивизион')}</span>
                <input className="input" inputMode="numeric" value={edit.division} onChange={(e) => setEdit({ ...edit, division: e.target.value.replace(/\D/g, '') })} />
              </label>
            </div>
            <div className="field">
              <span>{t('Цвет')}</span>
              <div className="hstack">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEdit({ ...edit, color: c })}
                    style={{ width: 34, height: 34, borderRadius: 10, border: edit.color === c ? '3px solid var(--ink)' : '0', background: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <button className="btn block" disabled={busy} onClick={save}>
              {t('Сохранить')}
            </button>
            {edit.id && (
              <button
                className="btn bad-soft block"
                disabled={busy}
                onClick={async () =>
                  await ask(t('Удалить состав? Игры останутся, но без метки состава.')) &&
                  run(async () => {
                    await api.del(`/api/admin/squads/${edit.id}`);
                    await Promise.all([reload(), refresh()]);
                    setEdit(null);
                  }, t('Удалено'))
                }
              >
                {t('Удалить')}
              </button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
