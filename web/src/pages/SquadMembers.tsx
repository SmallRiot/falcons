import { useState } from 'react';
import { Search, Shield } from 'lucide-react';
import { api, type PublicUser } from '@shared/api';
import { POS_SHORT } from '@shared/format';
import { Avatar, Empty, Spinner, useAction, useApi, useMe } from '@shared/ui';

type Row = PublicUser & { status: string; roles: string[]; squads: number[] };

/** Тренер и админ раскидывают игроков по составам: тап по метке состава — добавить/убрать. */
export default function SquadMembers() {
  const { me } = useMe();
  const { data, loading, setData } = useApi<Row[]>('/api/console/players');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<number | 'none' | 0>(0);
  const { run } = useAction();
  const squads = me.squads ?? [];

  const toggle = (u: Row, id: number) => {
    const next = u.squads.includes(id) ? u.squads.filter((x) => x !== id) : [...u.squads, id];
    setData((d) => d?.map((x) => (x.id === u.id ? { ...x, squads: next } : x)) ?? null);
    void run(() => api.put(`/api/users/${u.id}/squads`, { squads: next }));
  };

  if (loading) return <Spinner />;
  const rows = (data ?? [])
    .filter((u) => u.status === 'active' && !u.roles.includes('guest'))
    .filter((u) => (filter === 0 ? true : filter === 'none' ? !u.squads.length : u.squads.includes(filter)))
    .filter((u) => !q || `${u.name} ${u.number ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const noSquad = (data ?? []).filter((u) => u.status === 'active' && !u.roles.includes('guest') && !u.squads.length).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Игроки по составам</h1>
          <div className="sub">Тап по метке — добавить в состав или убрать. Можно в несколько сразу.</div>
        </div>
      </div>
      <div className="chips" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
        {[
          [0, 'Все'] as const,
          ...squads.map((s) => [s.id, s.short] as const),
          ['none', `Без состава${noSquad ? ` · ${noSquad}` : ''}`] as const,
        ].map(([k, l]) => (
          <button key={String(k)} className={`chip ${filter === k ? 'info' : ''}`} style={{ border: 0, height: 32, padding: '0 14px', flex: 'none' }} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        <Search size={17} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--muted)' }} />
        <input className="input" style={{ paddingLeft: 40 }} placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!rows.length ? (
        <Empty icon={<Shield size={26} />} title="Никого" />
      ) : (
        <div className="list">
          {rows.map((u) => (
            <div key={u.id} className="row" style={{ flexWrap: 'wrap' }}>
              <Avatar user={u} size="sm" />
              <div className="grow">
                <div className="title">{u.name}</div>
                <div className="meta">
                  {u.number != null ? `#${u.number} · ` : ''}
                  {u.position ? POS_SHORT[u.position] : 'позиция не указана'}
                </div>
              </div>
              <div className="hstack" style={{ gap: 4 }}>
                {squads.map((s) => {
                  const on = u.squads.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      className="chip"
                      style={{ border: 0, height: 30, padding: '0 10px', background: on ? s.color : 'var(--surface-2)', color: on ? '#fff' : 'var(--muted)' }}
                      onClick={() => toggle(u, s.id)}
                    >
                      {s.short}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
