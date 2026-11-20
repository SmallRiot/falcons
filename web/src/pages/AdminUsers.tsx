import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import { api, type PublicUser, type Role } from '@shared/api';
import { fmt, POS_SHORT, ROLE_LABEL } from '@shared/format';
import { Avatar, Empty, Jersey, Segmented, Sheet, Spinner, SquadChip, SquadPicker, useAction, useApi, useMe } from '@shared/ui';

type AdminUser = PublicUser & { squads: number[]; roles: Role[]; status: 'pending' | 'active' | 'rejected'; signup_blocked: boolean; debt: number; created_at: string };

export default function AdminUsers() {
  const { me, refresh } = useMe();
  const { data, loading, reload } = useApi<AdminUser[]>('/api/admin/users');
  const [tab, setTab] = useState<'active' | 'pending' | 'rejected'>('active');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<AdminUser | null>(null);
  const { busy, run } = useAction();

  const all = data ?? [];
  const pending = all.filter((u) => u.status === 'pending').length;
  const list = all
    .filter((u) => u.status === tab)
    .filter((u) => !q || `${u.name} ${u.username ?? ''} ${u.number ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  const squadsById = new Map((me.squads ?? []).map((s) => [s.id, s]));
  const patch = (u: AdminUser, body: Partial<Pick<AdminUser, 'status' | 'roles' | 'signup_blocked' | 'squads'>>, ok: string) =>
    run(async () => {
      await api.patch(`/api/admin/users/${u.id}`, body);
      await Promise.all([reload(), refresh()]);
      setOpen((o) => (o ? { ...o, ...body } : o));
    }, ok);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Люди</h1>
      </div>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ['active', `В команде · ${all.filter((u) => u.status === 'active').length}`],
          ['pending', `Заявки${pending ? ` · ${pending}` : ''}`],
          ['rejected', 'Закрыт'],
        ]}
      />
      <div style={{ position: 'relative' }}>
        <Search size={17} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--muted)' }} />
        <input className="input" style={{ paddingLeft: 40 }} placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? (
        <Spinner />
      ) : !list.length ? (
        <Empty icon={<Users size={26} />} title={tab === 'pending' ? 'Новых заявок нет' : 'Никого'} />
      ) : (
        <div className="list">
          {list.map((u) => (
            <button key={u.id} className="row" onClick={() => setOpen(u)}>
              <Avatar user={u} />
              <div className="grow">
                <div className="title">{u.name}</div>
                <div className="meta">
                  {u.username ? `@${u.username}` : `id ${u.id}`}
                  {u.position ? ` · ${POS_SHORT[u.position]}` : ''}
                </div>
              </div>
              <div className="chips" style={{ justifyContent: 'flex-end' }}>
                {u.squads.map((id) => squadsById.get(id) && <SquadChip key={id} squad={squadsById.get(id)!} />)}
                {u.roles.map((r) => (
                  <span key={r} className="chip info">
                    {ROLE_LABEL[r]}
                  </span>
                ))}
                {u.debt > 0 && <span className="chip bad">−{fmt.gel(u.debt)}</span>}
                {u.signup_blocked && <span className="chip bad">⛔︎ запись</span>}
              </div>
              {tab === 'pending' ? (
                <span
                  className="btn ok xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    void patch(u, { status: 'active' }, `${u.first_name} в команде`);
                  }}
                >
                  Пустить
                </span>
              ) : (
                <Jersey n={u.number} />
              )}
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name}>
        {open && (
          <>
            <div className="hstack">
              <Avatar user={open} size="lg" />
              <div className="vstack" style={{ gap: 2 }}>
                <div className="muted small">{open.username ? `@${open.username}` : `Telegram id ${open.id}`}</div>
                <div className="small">
                  {open.number != null ? `#${open.number}` : 'без номера'} · {open.position ? POS_SHORT[open.position] : '—'}
                </div>
                {open.debt > 0 && <span className="chip bad">Долг {fmt.gel(open.debt)}</span>}
              </div>
            </div>

            {open.status !== 'active' ? (
              <div className="btn-row">
                {open.status === 'pending' && (
                  <button className="btn bad-soft" disabled={busy} onClick={() => patch(open, { status: 'rejected' }, 'Отклонено')}>
                    Отклонить
                  </button>
                )}
                <button className="btn ok" disabled={busy} onClick={() => patch(open, { status: 'active' }, 'Доступ открыт')}>
                  Пустить в команду
                </button>
              </div>
            ) : (
              <>
                <div className="section-title">Составы на игры</div>
                <SquadPicker squads={me.squads ?? []} value={open.squads} onChange={(v) => patch(open, { squads: v }, 'Составы обновлены')} />
                <div className="section-title">Роли</div>
                <div className="list">
                  {(['admin', 'coach', 'service'] as Role[]).map((r) => (
                    <label key={r} className="row check" style={{ cursor: 'pointer' }}>
                      <div className="grow">
                        <div className="title">{ROLE_LABEL[r]}</div>
                        <div className="meta">
                          {r === 'admin' ? 'Люди, взносы, счета' : r === 'coach' ? 'События и пятёрки' : 'Заявки на заточку'}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        disabled={busy || (r === 'admin' && open.id === me.user.id)}
                        checked={open.roles.includes(r)}
                        onChange={(e) =>
                          patch(
                            open,
                            { roles: e.target.checked ? [...open.roles, r] : open.roles.filter((x) => x !== r) },
                            'Роли обновлены',
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
                <div className="section-title">Запись на тренировки</div>
                <div className="list">
                  <label className="row check" style={{ cursor: 'pointer' }}>
                    <div className="grow">
                      <div className="title">Закрыть запись</div>
                      <div className="meta">Например, пока не оплачен взнос</div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={open.signup_blocked}
                      onChange={(e) =>
                        patch(open, { signup_blocked: e.target.checked }, e.target.checked ? 'Запись закрыта' : 'Запись открыта')
                      }
                    />
                  </label>
                </div>
                {open.id !== me.user.id && (
                  <button
                    className="btn bad-soft block"
                    disabled={busy}
                    onClick={() => confirm(`Убрать ${open.name} из команды?`) && patch(open, { status: 'rejected' }, 'Доступ закрыт')}
                  >
                    Убрать из команды
                  </button>
                )}
              </>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
