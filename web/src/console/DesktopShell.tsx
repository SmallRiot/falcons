import { NavLink } from 'react-router-dom';
import {
  Bell, CalendarDays, ClipboardCheck, Home, Landmark, LayoutGrid, LogOut, Receipt, Scissors, Shield, Trophy, User, Users, Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { setDevUser, setSession, type EventSummary } from '@shared/api';
import { fmt } from '@shared/format';
import { ROLE_LABEL } from '@shared/format';
import { Avatar, can, useApi, useMe } from '@shared/ui';

/** Веб на компьютере: левое меню + верхняя строка с ближайшими событиями. Мобильные экраны живут в правой части. */
export default function DesktopShell({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const b = me.badges ?? {};
  const staff = can(me, 'admin', 'coach');
  const events = useApi<EventSummary[]>(`/api/events${staff ? '?all=1' : ''}`);
  const upcoming = (events.data ?? []).filter((e) => !e.cancelled && new Date(e.starts_at).getTime() > Date.now());
  const nextTraining = upcoming.find((e) => e.type === 'training');
  // ближайшая игра каждого состава
  const nextGames = (me.squads ?? [])
    .map((s) => ({ s, e: upcoming.find((e) => e.type === 'game' && e.squads.some((x) => x.id === s.id)) }))
    .filter((x) => x.e && (staff || (me.user.squads ?? []).includes(x.s.id)));
  const debt = (me.debts ?? []).reduce((s, d) => s + d.amount, 0) + (me.sharpeningDebt?.total ?? 0);

  return (
    <div className="desk">
      <aside className="desk-side">
        <div className="desk-brand">
          <img src="/logo.png" alt="" />
          <b>FALCONS</b>
          <span>Hockey club</span>
        </div>

        <Item to="/" icon={<Home size={18} />} label="Главная" end />
        <Item to="/events" icon={<CalendarDays size={18} />} label="Расписание" />
        <Item to="/finance" icon={<Wallet size={18} />} label="Мои взносы" cnt={debt ? '!' : undefined} />
        <Item to="/sharpening" icon={<Scissors size={18} />} label="Заточка" cnt={me.sharpeningDebt ? '!' : undefined} />
        <Item to="/notifications" icon={<Bell size={18} />} label="Уведомления" cnt={b.unread} />
        <Item to="/profile" icon={<User size={18} />} label="Профиль и стата" />

        {can(me, 'admin', 'coach', 'service') && <div className="desk-group">Управление</div>}
        {can(me, 'admin', 'coach', 'service') && <Item to="/console/players" icon={<Users size={18} />} label="Игроки" cnt={can(me, 'admin') ? b.pendingUsers : undefined} />}
        {staff && <Item to="/console/games" icon={<Trophy size={18} />} label="Посещаемость игр" />}
        {staff && <Item to="/console/trainings" icon={<ClipboardCheck size={18} />} label="Стата тренировок" />}
        {can(me, 'admin') && <Item to="/console/finance" icon={<Receipt size={18} />} label="Финансы" cnt={b.proofs} />}
        {can(me, 'service', 'admin') && <Item to="/service" icon={<Scissors size={18} />} label="Очередь заточки" cnt={b.sharpenings} />}
        {can(me, 'admin') && <Item to="/admin/squads" icon={<Shield size={18} />} label="Составы" />}
        {can(me, 'admin') && <Item to="/admin/accounts" icon={<Landmark size={18} />} label="Счета" />}
        {staff && <Item to="/events/new" icon={<LayoutGrid size={18} />} label="Новое событие" />}

        <div className="desk-user">
          <Avatar user={me.user} size="sm" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 650, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.user.name}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              {me.user.roles.length ? me.user.roles.map((r) => ROLE_LABEL[r]).join(' · ') : 'Игрок'}
            </div>
          </div>
          <button
            className="icon-btn"
            style={{ width: 30, height: 30 }}
            title="Выйти"
            onClick={() => {
              setSession(null);
              setDevUser(null);
              location.href = '/';
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      <div className="desk-main">
        <div className="desk-top">
          <div>
            <div className="k">Сезон</div>
            <div className="v">{season()}</div>
          </div>
          <div>
            <div className="k">След. тренировка</div>
            <div className="v">
              {nextTraining ? (
                <span>
                  {fmt.dateShort(nextTraining.starts_at)} <small>{fmt.time(nextTraining.starts_at)} · {nextTraining.going} идут</small>
                </span>
              ) : (
                '—'
              )}
            </div>
          </div>
          <div>
            <div className="k">След. игры</div>
            <div className="v">
              {nextGames.length
                ? nextGames.map(({ s, e }) => (
                    <span key={s.id}>
                      <b style={{ color: s.color }}>{s.short}</b> {fmt.dateShort(e!.starts_at)} <small>{fmt.time(e!.starts_at)} {e!.title ?? ''}</small>
                    </span>
                  ))
                : '—'}
            </div>
          </div>
        </div>
        <div className="desk-content">{children}</div>
      </div>
    </div>
  );
}

function season() {
  const d = new Date();
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${String(y + 1).slice(2)}`;
}

function Item({ to, icon, label, cnt, end }: { to: string; icon: ReactNode; label: string; cnt?: number | string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `desk-link ${isActive ? 'on' : ''}`}>
      {icon}
      {label}
      {cnt ? <span className="cnt">{cnt}</span> : null}
    </NavLink>
  );
}
