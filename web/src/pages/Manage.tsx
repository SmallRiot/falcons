import { useNavigate } from 'react-router-dom';
import { CalendarDays, CalendarPlus, ChevronRight, Landmark, Monitor, Receipt, Scissors, Shield, UserPlus, Users } from 'lucide-react';
import type { EventSummary } from '@shared/api';
import { fmt, ROLE_LABEL } from '@shared/format';
import { can, useApi, useMe } from '@shared/ui';

/** Главная режима «Управление»: что ждёт решения + разделы. */
export default function Manage() {
  const { me } = useMe();
  const nav = useNavigate();
  const b = me.badges ?? {};
  const admin = can(me, 'admin');
  const coach = can(me, 'admin', 'coach');
  const service = can(me, 'admin', 'service');
  const events = useApi<EventSummary[]>(coach ? '/api/events?all=1' : null);

  const tasks = [
    admin && { icon: <UserPlus size={20} />, title: 'Заявки на доступ', n: b.pendingUsers ?? 0, to: '/admin/users' },
    admin && { icon: <Receipt size={20} />, title: 'Скрины на проверке', n: b.proofs ?? 0, to: '/admin/finance' },
    service && { icon: <Scissors size={20} />, title: 'Заточки в очереди', n: b.sharpenings ?? 0, to: '/service' },
  ].filter(Boolean) as { icon: React.ReactNode; title: string; n: number; to: string }[];
  const waiting = tasks.filter((t) => t.n > 0);
  const upcoming = (events.data ?? []).filter((e) => !e.cancelled && new Date(e.starts_at).getTime() > Date.now() - 3 * 3600e3).slice(0, 4);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Управление</h1>
          <div className="sub">
            {me.user.roles.map((r) => ROLE_LABEL[r] ?? r).join(' · ')}
          </div>
        </div>
      </div>

      {tasks.length > 0 && (
        <>
          <div className="section-title">Ждут тебя</div>
          {waiting.length ? (
            <div className="list">
              {waiting.map((t) => (
                <Row key={t.to} icon={t.icon} title={t.title} count={t.n} onClick={() => nav(t.to)} />
              ))}
            </div>
          ) : (
            <div className="card muted small">Всё разобрано 👌</div>
          )}
        </>
      )}

      {coach && upcoming.length > 0 && (
        <>
          <div className="section-title">Ближайшие события</div>
          <div className="list">
            {upcoming.map((e) => (
              <button key={e.id} className="row" onClick={() => nav(`/events/${e.id}`)}>
                <span style={{ color: 'var(--falcon)' }}>
                  <CalendarDays size={20} />
                </span>
                <div className="grow">
                  <div className="title">{e.title || (e.type === 'game' ? 'Игра' : 'Тренировка')}</div>
                  <div className="meta">
                    {fmt.day(e.starts_at)}, {fmt.time(e.starts_at)} · идут {e.going}
                  </div>
                </div>
                <span className={`chip ${e.lineup_published ? 'ok' : 'warn'}`}>{e.lineup_published ? 'Пятёрки есть' : 'Без пятёрок'}</span>
                <ChevronRight size={18} className="chev" />
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Разделы</div>
      <div className="list">
        {coach && <Row icon={<CalendarPlus size={20} />} title="Создать тренировку или игру" onClick={() => nav('/events/new')} />}
        {coach && <Row icon={<CalendarDays size={20} />} title="События и пятёрки" onClick={() => nav('/events')} />}
        {admin && <Row icon={<Users size={20} />} title="Люди и роли" count={b.pendingUsers} onClick={() => nav('/admin/users')} />}
        {admin && <Row icon={<Receipt size={20} />} title="Взносы и проверка оплат" count={b.proofs} onClick={() => nav('/admin/finance')} />}
        {service && <Row icon={<Scissors size={20} />} title="Очередь заточки" count={b.sharpenings} onClick={() => nav('/service')} />}
        {admin && <Row icon={<Shield size={20} />} title="Составы" onClick={() => nav('/admin/squads')} />}
        {admin && <Row icon={<Landmark size={20} />} title="Счета для оплаты" onClick={() => nav('/admin/accounts')} />}
      </div>

      {coach && (
        <div className="muted small hstack" style={{ gap: 8, padding: '4px 4px 0' }}>
          <Monitor size={16} /> Таблицы посещаемости, финансов и доска пятёрок — в веб-консоли на компьютере.
        </div>
      )}
    </div>
  );
}

function Row({ icon, title, count, onClick }: { icon: React.ReactNode; title: string; count?: number; onClick: () => void }) {
  return (
    <button className="row" onClick={onClick}>
      <span style={{ color: 'var(--falcon)' }}>{icon}</span>
      <div className="grow">
        <div className="title">{title}</div>
      </div>
      {count ? <span className="chip bad">{count}</span> : null}
      <ChevronRight size={18} className="chev" />
    </button>
  );
}
