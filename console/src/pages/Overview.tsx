import { Link, useNavigate } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { api, type EventSummary, type PublicUser, type Rates, type Period, type Role } from '@shared/api';
import { birthday, fmt, plural } from '@shared/format';
import { Avatar, can, SquadChip, useAction, useApi, useMe } from '@shared/ui';

type Player = PublicUser & { status: string; roles: Role[]; debt: number; trainings30: number; squads: number[] };
type PeriodRow = Period & { rates: Rates; counts: Record<string, number> };

export default function Overview() {
  const { me, refresh } = useMe();
  const nav = useNavigate();
  const admin = can(me, 'admin');
  const events = useApi<EventSummary[]>('/api/events?all=1');
  const players = useApi<Player[]>('/api/console/players');
  const periods = useApi<PeriodRow[]>(admin ? '/api/admin/periods' : null);
  const sharp = useApi<{ id: number; status: string; payment: string; price: number }[]>('/api/service/sharpening');
  const bdays = useApi<{ id: number; name: string; number: number | null; birth_date: string; in_days: number; turns: number }[]>('/api/console/birthdays?days=30');
  const { run } = useAction();

  const upcoming = (events.data ?? []).filter((e) => !e.cancelled).slice(0, 6);
  const all = players.data ?? [];
  const active = all.filter((u) => u.status === 'active');
  const pending = all.filter((u) => u.status === 'pending');
  const debtors = active.filter((u) => u.debt > 0).sort((a, b) => b.debt - a.debt);
  const cur = periods.data?.[0];
  const sharpOpen = (sharp.data ?? []).filter((s) => s.status === 'new' || s.status === 'accepted').length;
  const sharpDebt = (sharp.data ?? []).filter((s) => s.payment === 'unpaid' && s.status !== 'rejected').reduce((x, s) => x + s.price, 0);
  const lazy = [...active].sort((a, b) => a.trainings30 - b.trainings30).slice(0, 5);

  return (
    <div className="cpage">
      <div className="c-head">
        <div>
          <h1>Обзор</h1>
          <div className="sub">Всё важное на одном экране</div>
        </div>
      </div>

      <div className="kpis">
        <Kpi k="В команде" v={String(active.length)} />
        <Kpi k="Заявки на доступ" v={String(pending.length)} tone={pending.length ? 'warn' : undefined} />
        {admin && <Kpi k="Скринов на проверке" v={String(me.badges?.proofs ?? 0)} tone={me.badges?.proofs ? 'warn' : undefined} />}
        <Kpi k="Долг по взносам" v={fmt.gel(debtors.reduce((s, u) => s + u.debt, 0))} tone={debtors.length ? 'bad' : undefined} />
        <Kpi k="Заточка: очередь / долг" v={`${sharpOpen} · ${fmt.gel(sharpDebt)}`} />
      </div>

      <div className="c-grid two">
        <div className="c-card pad">
          <h3>
            Ближайшие события <Link to="/schedule">Всё расписание</Link>
          </h3>
          {upcoming.map((e) => (
            <div key={e.id} className="c-row">
              <div style={{ width: 92 }}>
                <b>{fmt.dateShort(e.starts_at)}</b>
                <div className="muted small">{fmt.time(e.starts_at)}</div>
              </div>
              <div className="grow">
                <div className="hstack" style={{ gap: 6 }}>
                  <b>{e.type === 'game' ? e.title ?? 'Игра' : e.title || 'Тренировка'}</b>
                  {e.type === 'game' && <span className="chip game">Игра</span>}
                  {e.squads.map((s) => (
                    <SquadChip key={s.id} squad={s} />
                  ))}
                </div>
                <div className="muted small">
                  идут {e.going}
                  {e.capacity ? ` из ${e.capacity}` : ''} · не идут {e.out}
                </div>
              </div>
              {e.lineup_published ? <span className="chip ok">Пятёрки готовы</span> : <span className="chip">Пятёрок нет</span>}
              <button className="btn secondary sm" onClick={() => nav(`/schedule/${e.id}/lineup`)}>
                <LayoutGrid size={15} /> Пятёрки
              </button>
            </div>
          ))}
          {!upcoming.length && <div className="muted">Ничего не запланировано</div>}
        </div>

        <div className="vstack" style={{ gap: 14 }}>
          {admin && pending.length > 0 && (
            <div className="c-card pad">
              <h3>Заявки на доступ</h3>
              {pending.map((u) => (
                <div key={u.id} className="c-row">
                  <Avatar user={u} size="sm" />
                  <div className="grow">
                    <b>{u.name}</b>
                    <div className="muted small">{u.username ? `@${u.username}` : `id ${u.id}`}</div>
                  </div>
                  <button
                    className="btn ok xs"
                    onClick={() =>
                      run(async () => {
                        await api.patch(`/api/admin/users/${u.id}`, { status: 'active' });
                        await Promise.all([players.reload(), refresh()]);
                      }, `${u.first_name} в команде`)
                    }
                  >
                    Пустить
                  </button>
                </div>
              ))}
            </div>
          )}
          {admin && cur && (
            <div className="c-card pad">
              <h3>
                Взносы · {fmt.month(cur.month)} <Link to="/finance">Финансы</Link>
              </h3>
              <div className="hstack wrap" style={{ gap: 8 }}>
                <span className={`chip ${cur.locked ? 'ok' : 'info'}`}>{cur.locked ? 'Сбор идёт' : 'Опрос'}</span>
                <span className="chip ok">оплачено {cur.counts.paid ?? 0}</span>
                <span className="chip info">на проверке {cur.counts.pending ?? 0}</span>
                <span className="chip warn">не оплачено {(cur.counts.unpaid ?? 0) + (cur.counts.rejected ?? 0)}</span>
              </div>
            </div>
          )}
          <div className="c-card pad">
            <h3>🎂 Дни рождения · 30 дней</h3>
            {(bdays.data ?? []).map((b) => (
              <div key={b.id} className="c-row">
                <div style={{ width: 86 }}>
                  <b>{birthday(b.birth_date)}</b>
                </div>
                <div className="grow">
                  <b>{b.name}</b>
                  <div className="muted small">
                    исполнится {b.turns} · {b.in_days === 0 ? 'сегодня 🎉' : b.in_days === 1 ? 'завтра' : `через ${b.in_days} ${plural(b.in_days, 'день', 'дня', 'дней')}`}
                  </div>
                </div>
                {admin && b.in_days === 0 && (
                  <button
                    className="btn secondary xs"
                    onClick={() => confirm(`Ещё раз поздравить ${b.name} в чате?`) && run(() => api.post('/api/console/birthdays/congratulate', { user_id: b.id }), 'Поздравление отправлено 🎂')}
                  >
                    Поздравить ещё раз
                  </button>
                )}
              </div>
            ))}
            {!bdays.data?.length && <div className="muted">В ближайший месяц никого</div>}
            <div className="muted small" style={{ marginTop: 8 }}>Бот сам поздравляет в чате утром в день рождения.</div>
          </div>
          <div className="c-card pad">
            <h3>Должники</h3>
            {debtors.slice(0, 6).map((u) => (
              <div key={u.id} className="c-row">
                <Avatar user={u} size="sm" />
                <div className="grow">
                  <b>{u.name}</b>
                </div>
                <b style={{ color: 'var(--bad)' }}>{fmt.gel(u.debt)}</b>
              </div>
            ))}
            {!debtors.length && <div className="muted">Долгов нет 🎉</div>}
          </div>
          <div className="c-card pad">
            <h3>Реже всех на тренировках (30 дней)</h3>
            {lazy.map((u) => (
              <div key={u.id} className="c-row">
                <Avatar user={u} size="sm" />
                <div className="grow">
                  <b>{u.name}</b>
                </div>
                <span className="muted">{u.trainings30} трен.</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ k, v, tone }: { k: string; v: string; tone?: 'warn' | 'bad' }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className="v" style={{ color: tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : undefined }}>
        {v}
      </div>
    </div>
  );
}
