import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, type Squad } from '@shared/api';
import { Spinner, useAction, useApi, useMe } from '@shared/ui';
import Drawer from '../Drawer';

const COLORS = ['#2b88cf', '#1f9d6b', '#c98612', '#8a4fd8', '#d64545', '#0d1f2d'];
const EMPTY = { name: '', short: '', color: COLORS[0], division: '', sort: 0 };

export default function Squads() {
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
    }, 'Сохранено');
  return (
    <div className="cpage">
      <div className="c-head">
        <div>
          <h1>Составы</h1>
          <div className="sub">Для игр. Тренировки общие. Игрок может быть в нескольких составах — отмечается в «Игроках».</div>
        </div>
        <button className="btn" onClick={() => setEdit({ ...EMPTY })}>
          <Plus size={18} /> Состав
        </button>
      </div>
      <div className="c-grid three">
        {(data ?? []).map((s) => (
          <button key={s.id} className="c-card pad" style={{ border: 0, textAlign: 'left', cursor: 'pointer', borderTop: `6px solid ${s.color}` }} onClick={() => setEdit({ ...s, division: s.division ? String(s.division) : '' })}>
            <div className="hstack">
              <span className="chip" style={{ background: `${s.color}22`, color: s.color }}>
                {s.short}
              </span>
              <span className="muted small">{s.division ? `${s.division} дивизион` : ''}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>{s.name}</div>
            <div className="muted">{count(s.id)} игроков</div>
          </button>
        ))}
      </div>
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Состав' : 'Новый состав'}>
        {edit && (
          <>
            <label className="field">
              <span>Название</span>
              <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <div className="form-row">
              <label className="field">
                <span>Метка (до 8 символов)</span>
                <input className="input" value={edit.short} maxLength={8} onChange={(e) => setEdit({ ...edit, short: e.target.value })} />
              </label>
              <label className="field">
                <span>Дивизион</span>
                <input className="input" inputMode="numeric" value={edit.division} onChange={(e) => setEdit({ ...edit, division: e.target.value.replace(/\D/g, '') })} />
              </label>
            </div>
            <div className="field">
              <span>Цвет</span>
              <div className="hstack">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setEdit({ ...edit, color: c })} style={{ width: 34, height: 34, borderRadius: 10, border: edit.color === c ? '3px solid var(--ink)' : 0, background: c }} aria-label={c} />
                ))}
              </div>
            </div>
            <button className="btn block" disabled={busy} onClick={save}>
              Сохранить
            </button>
            {edit.id && (
              <button
                className="btn bad-soft block"
                disabled={busy}
                onClick={() =>
                  confirm('Удалить состав? Игры останутся без метки состава.') &&
                  run(async () => {
                    await api.del(`/api/admin/squads/${edit.id}`);
                    await Promise.all([reload(), refresh()]);
                    setEdit(null);
                  }, 'Удалено')
                }
              >
                Удалить
              </button>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
