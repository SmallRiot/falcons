import { t } from '@shared/i18n';
import { useEffect, useState } from 'react';
import { PlayerEdit } from '@shared/PlayerEdit';
import { Search, Users } from 'lucide-react';
import { api, type PublicUser, type Role } from '@shared/api';
import { birthday, fmt, POS_SHORT, ROLE_LABEL } from '@shared/format';
import { askText, ask, Avatar, Empty, Jersey, Segmented, Sheet, Spinner, SquadChip, SquadPicker, useAction, useApi, useMe } from '@shared/ui';

type AdminUser = PublicUser & { squads: number[]; guest_price: number | null; roles: Role[]; status: 'pending' | 'active' | 'rejected'; signup_blocked: boolean; debt: number; created_at: string };

export default function AdminUsers() {
  const { me, refresh } = useMe();
  const { data, loading, reload } = useApi<AdminUser[]>('/api/admin/users');
  const [tab, setTab] = useState<'active' | 'pending' | 'rejected'>('active');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<AdminUser | null>(null);
  const { busy, run } = useAction();
  const [editOpen, setEditOpen] = useState(false);
  // после правки/фото подтягиваем свежие данные в открытую карточку
  useEffect(() => {
    setOpen((o) => (o ? (data ?? []).find((u) => u.id === o.id) ?? o : o));
  }, [data]);

  /** спросить цену выхода и сделать гостем (при впускании или из карточки) */
  const makeGuest = async (u: AdminUser, admit: boolean) => {
    const v = await askText(t('Цена за выход на лёд для {0}, ₾\nГость платит при каждой записи. 0 — бесплатно.', u.first_name), String(u.guest_price ?? 30), t('например 30'));
    if (v === null || !(Number(v) >= 0)) return;
    await patch(
      u,
      { ...(admit ? { status: 'active' as const } : {}), roles: [...u.roles.filter((r) => r !== 'guest'), 'guest'], guest_price: Number(v) },
      admit ? t('{0} пущен гостем · {1} ₾ за выход', u.first_name, Number(v)) : t('Гость · {0} ₾ за выход', Number(v)),
    );
  };

  const all = data ?? [];
  const pending = all.filter((u) => u.status === 'pending').length;
  const list = all
    .filter((u) => u.status === tab)
    .filter((u) => !q || `${u.name} ${u.username ?? ''} ${u.number ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  const squadsById = new Map((me.squads ?? []).map((s) => [s.id, s]));
  const patch = (u: AdminUser, body: Partial<Pick<AdminUser, 'status' | 'roles' | 'signup_blocked' | 'squads' | 'guest_price'>>, ok: string) =>
    run(async () => {
      await api.patch(`/api/admin/users/${u.id}`, body);
      await Promise.all([reload(), refresh()]);
      setOpen((o) => (o ? { ...o, ...body } : o));
    }, ok);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('Люди')}</h1>
      </div>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ['active', t('В команде · {0}', all.filter((u) => u.status === 'active').length)],
          ['pending', t('Заявки{0}', pending ? ` · ${pending}` : '')],
          ['rejected', t('Закрыт')],
        ]}
      />
      <div style={{ position: 'relative' }}>
        <Search size={17} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--muted)' }} />
        <input className="input" style={{ paddingLeft: 40 }} placeholder={t('Поиск')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? (
        <Spinner />
      ) : !list.length ? (
        <Empty icon={<Users size={26} />} title={tab === 'pending' ? t('Новых заявок нет') : t('Никого')} />
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
                {u.signup_blocked && <span className="chip bad">{t('⛔︎ запись')}</span>}
              </div>
              {tab === 'pending' ? (
                <span
                  className="btn ok xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    void patch(u, { status: 'active' }, t('{0} в команде', u.first_name));
                  }}
                >
                  {t('Пустить')}
                </span>
              ) : (
                <Jersey n={u.number} />
              )}
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={!!open}
        onClose={() => {
          setOpen(null);
          setEditOpen(false);
        }}
        title={open?.name}
      >
        {open && (
          <>
            <div className="hstack">
              <Avatar user={open} size="lg" />
              <div className="vstack" style={{ gap: 2 }}>
                <div className="muted small">{open.username ? `@${open.username}` : `Telegram id ${open.id}`}</div>
                <div className="small">
                  {open.number != null ? `#${open.number}` : t('без номера')} · {open.position ? POS_SHORT[open.position] : '—'}
                  {open.birth_date ? ` · 🎂 ${birthday(open.birth_date)}` : ''}
                </div>
                {open.debt > 0 && <span className="chip bad">{t('Долг')} {fmt.gel(open.debt)}</span>}
              </div>
            </div>
            <button className="btn secondary block" onClick={() => setEditOpen((x) => !x)}>
              {editOpen ? t('Скрыть') : t('Изменить профиль и фото')}
            </button>
            {editOpen && (
              <div className="card">
                <PlayerEdit user={open} onSaved={() => Promise.all([reload(), refresh()])} />
              </div>
            )}

            {open.status !== 'active' ? (
              <>
              <div className="btn-row">
                {open.status === 'pending' && (
                  <button className="btn bad-soft" disabled={busy} onClick={() => patch(open, { status: 'rejected' }, t('Отклонено'))}>
                    {t('Отклонить')}
                  </button>
                )}
                <button className="btn ok" disabled={busy} onClick={() => patch(open, { status: 'active' }, t('Доступ открыт'))}>
                  {t('Пустить в команду')}
                </button>
              </div>
              <button className="btn secondary block" disabled={busy} onClick={() => makeGuest(open, true)}>
                {t('Пустить гостем — с оплатой за каждый выход')}
              </button>
              </>
            ) : (
              <>
                <div className="section-title">{t('Составы на игры')}</div>
                <SquadPicker squads={me.squads ?? []} value={open.squads} onChange={(v) => patch(open, { squads: v }, t('Составы обновлены'))} />
                <div className="section-title">{t('Роли')}</div>
                <div className="list">
                  {(['admin', 'coach', 'service', 'guest'] as Role[]).map((r) => (
                    <label key={r} className="row check" style={{ cursor: 'pointer' }}>
                      <div className="grow">
                        <div className="title">{ROLE_LABEL[r]}</div>
                        <div className="meta">
                          {r === 'admin'
                            ? t('Люди, взносы, счета')
                            : r === 'coach'
                              ? t('События и пятёрки')
                              : r === 'service'
                                ? t('Заявки на заточку')
                                : open.roles.includes('guest')
                                  ? t('Платит за каждый выход: {0} · без взносов', fmt.gel(open.guest_price ?? 0))
                                  : t('Платит за каждый выход, без взносов')}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        disabled={busy || (r === 'admin' && open.id === me.user.id)}
                        checked={open.roles.includes(r)}
                        onChange={(e) =>
                          r === 'guest' && e.target.checked
                            ? makeGuest(open, false)
                            : patch(
                                open,
                                { roles: e.target.checked ? [...open.roles, r] : open.roles.filter((x) => x !== r) },
                                t('Роли обновлены'),
                              )
                        }
                      />
                    </label>
                  ))}
                </div>
                {open.roles.includes('guest') && (
                  <button className="btn ghost block" disabled={busy} onClick={() => makeGuest(open, false)}>
                    {t('Изменить цену выхода (')}{fmt.gel(open.guest_price ?? 0)})
                  </button>
                )}
                <div className="section-title">{t('Запись на тренировки')}</div>
                <div className="list">
                  <label className="row check" style={{ cursor: 'pointer' }}>
                    <div className="grow">
                      <div className="title">{t('Закрыть запись')}</div>
                      <div className="meta">{t('Например, пока не оплачен взнос')}</div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={open.signup_blocked}
                      onChange={(e) =>
                        patch(open, { signup_blocked: e.target.checked }, e.target.checked ? t('Запись закрыта') : t('Запись открыта'))
                      }
                    />
                  </label>
                </div>
                {open.id !== me.user.id && (
                  <button
                    className="btn bad-soft block"
                    disabled={busy}
                    onClick={async () => await ask(t('Убрать {0} из команды?', open.name)) && patch(open, { status: 'rejected' }, t('Доступ закрыт'))}
                  >
                    {t('Убрать из команды')}
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
