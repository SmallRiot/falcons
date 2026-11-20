import { NavLink } from 'react-router-dom';
import { CalendarDays, ClipboardCheck, LayoutDashboard, Landmark, LogOut, Receipt, Scissors, Shield, Trophy, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { setDevUser, setSession, type EventSummary } from '@shared/api';
import { fmt, ROLE_LABEL } from '@shared/format';
import { Avatar, can, useApi, useMe } from '@shared/ui';

/** Каркас консоли: левое меню + верхняя строка с ближайшими событиями. */
export default function Shell({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const b = me.badges ?? {};
  const admin = can(me, 'admin');
  const events = useApi<EventSummary[]>('/api/events?all=1');
  const upcoming = (events.data ?? []).filter((e) => !e.cancelled && new Date(e.starts_at).getTime() > Date.now());
  const nextTraining = upcoming.find((e) => e.type === 'training');
  const nextGames = (me.squads ?? []).map((s) => ({ s, e: upcoming.find((e) => e.type === 'game' && e.squads.some((x) => x.id === s.id)) })).filter((x) => x.e);

  return (
    <div className="desk">
      <aside className="desk-side">
        <div className="desk-brand">
          <img src="/logo.png" alt="" />
          <b>FALCONS</b>
          <span>Hockey ops console</span>
        </div>

        <Item to="/" icon={<LayoutDashboard size={18} />} label="Обзор" end />
        <div className="desk-group">Команда</div>
        <Item to="/players" icon={<Users size={18} />} label="Игроки" cnt={admin ? b.pendingUsers : undefined} />
        {admin && <Item to="/squads" icon={<Shield size={18} />} label="Составы" />}
        <div className="desk-group">Лёд</div>
        <Item to="/schedule" icon={<CalendarDays size={18} />} label="Расписание и пятёрки" />
        <Item to="/games" icon={<Trophy size={18} />} label="Посещаемость игр" />
        <Item to="/trainings" icon={<ClipboardCheck size={18} />} label="Стата тренировок" />
        <div className="desk-group">Деньги и сервис</div>
        {admin && <Item to="/finance" icon={<Receipt size={18} />} label="Финансы" cnt={b.proofs} />}
        <Item to="/sharpening" icon={<Scissors size={18} />} label="Заточка" cnt={b.sharpenings} />
        {admin && <Item to="/accounts" icon={<Landmark size={18} />} label="Счета" />}

        <div className="desk-user">
          <Avatar user={me.user} size="sm" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 650, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.user.name}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              {me.user.roles.map((r) => ROLE_LABEL[r]).join(' · ')}
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
