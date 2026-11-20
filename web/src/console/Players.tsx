import { useState } from 'react';
import { api, type PublicUser, type Role } from '@shared/api';
import { fmt, POS_SHORT, ROLE_LABEL } from '@shared/format';
import { can, Spinner, useAction, useApi, useMe } from '@shared/ui';

type Row = PublicUser & {
  roles: Role[];
  status: 'pending' | 'active' | 'rejected';
  signup_blocked: boolean;
  squads: number[];
  debt: number;
  trainings30: number;
  games30: number;
};

export default function ConsolePlayers() {
  const { me, refresh } = useMe();
  const { data, reload, setData } = useApi<Row[]>('/api/console/players');
  const [q, setQ] = useState('');
  const [squad, setSquad] = useState(0);
  const [status, setStatus] = useState<'active' | 'pending' | 'rejected'>('active');
  const { run } = useAction();
  const admin = can(me, 'admin');
  if (!data) return <Spinner />;
  const squads = me.squads ?? [];

  const patch = (u: Row, body: Partial<Pick<Row, 'status' | 'roles' | 'signup_blocked' | 'squads'>>, ok?: string) => {
    setData((d) => d?.map((x) => (x.id === u.id ? { ...x, ...body } : x)) ?? null);
    return run(async () => {
      await api.patch(`/api/admin/users/${u.id}`, body);
      if (body.status) await Promise.all([reload(), refresh()]);
    }, ok);
  };

  const rows = data
    .filter((u) => u.status === status)
    .filter((u) => !squad || u.squads.includes(squad))
    .filter((u) => !q || `${u.name} ${u.username ?? ''} ${u.number ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const count = (s: Row['status']) => data.filter((u) => u.status === s).length;

  return (
    <div className="page wide">
      <div className="c-head">
        <div>
          <h1>Игроки</h1>
          <div className="sub">
            {count('active')} в команде · {count('pending')} ждут доступа
          </div>
        </div>
      </div>
      <div className="c-bar">
        <input className="input" placeholder="Поиск по имени, нику, номеру" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={squad} onChange={(e) => setSquad(Number(e.target.value))}>
          <option value={0}>Все составы</option>
          {squads.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {(['active', 'pending', 'rejected'] as const).map((s) => (
          <button key={s} className={`btn sm ${status === s ? '' : 'ghost'}`} onClick={() => setStatus(s)}>
            {{ active: 'В команде', pending: 'Заявки', rejected: 'Закрыт доступ' }[s]} {count(s)}
          </button>
        ))}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="sticky-col">Игрок</th>
              <th>Поз.</th>
              <th>Составы на игры</th>
              <th>Роли</th>
              <th className="num">Трен. 30д</th>
              <th className="num">Игр 30д</th>
              <th className="num">Долг</th>
              <th>Запись закрыта</th>
              {status !== 'active' && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="sticky-col">
                  <div className="player">
                    <span className="no">{u.number ?? ''}</span>
                    {u.name}
                    {u.username && <span className="muted" style={{ fontWeight: 400 }}>@{u.username}</span>}
                  </div>
                </td>
                <td className="muted">{u.position ? POS_SHORT[u.position] : '—'}</td>
                <td>
                  <div className="hstack" style={{ gap: 4 }}>
                    {squads.map((s) => {
                      const on = u.squads.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          className="sq-toggle"
                          disabled={!admin}
                          style={{ background: on ? s.color : 'var(--surface-2)', color: on ? '#fff' : 'var(--muted)' }}
                          title={on ? `Убрать из «${s.name}»` : `Добавить в «${s.name}»`}
                          onClick={() => patch(u, { squads: on ? u.squads.filter((x) => x !== s.id) : [...u.squads, s.id] })}
                        >
                          {s.short}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td>
                  <div className="hstack" style={{ gap: 4 }}>
                    {(['admin', 'coach', 'service'] as Role[]).map((r) => {
                      const on = u.roles.includes(r);
                      return (
                        <button
                          key={r}
                          className="sq-toggle"
                          disabled={!admin || (r === 'admin' && u.id === me.user.id)}
                          style={{ background: on ? 'var(--falcon)' : 'var(--surface-2)', color: on ? '#fff' : 'var(--muted)' }}
                          onClick={() => patch(u, { roles: on ? u.roles.filter((x) => x !== r) : [...u.roles, r] })}
                        >
                          {ROLE_LABEL[r]}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="num">{u.trainings30}</td>
                <td className="num">{u.games30}</td>
                <td className="num" style={{ color: u.debt ? 'var(--bad)' : undefined, fontWeight: u.debt ? 700 : 400 }}>
                  {u.debt ? fmt.gel(u.debt) : '—'}
                </td>
                <td>
                  <button
                    className={`switch ${u.signup_blocked ? 'on' : ''}`}
                    disabled={!admin}
                    onClick={() => patch(u, { signup_blocked: !u.signup_blocked })}
                    aria-label="Закрыть запись"
                  />
                </td>
                {status !== 'active' && (
                  <td>
                    {admin && (
                      <div className="hstack">
                        <button className="btn ok xs" onClick={() => patch(u, { status: 'active' }, 'Доступ открыт')}>
                          Пустить
                        </button>
                        {status === 'pending' && (
                          <button className="btn bad-soft xs" onClick={() => patch(u, { status: 'rejected' }, 'Отклонено')}>
                            Отклонить
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
