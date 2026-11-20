import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ban, Clock, LayoutGrid, MapPin, Pencil, StickyNote, Users } from 'lucide-react';
import { api, type EventDetail as ED, type PublicUser, type Team } from '@shared/api';
import { fmt, POS_SHORT } from '@shared/format';
import { Avatar, Empty, Jersey, Segmented, Spinner, SquadChip, useAction, useApi, useMe } from '@shared/ui';
import { SignupButtons, typeLabel } from './EventCard';
import Lines, { ORD, TEAM_GEN } from './Lines';

export default function EventDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { me } = useMe();
  const { data: ev, loading, reload } = useApi<ED>(`/api/events/${id}`, [id]);
  const [tab, setTab] = useState<'roster' | 'lines'>('roster');
  const [teamView, setTeamView] = useState<Team | null>(null);
  const { busy, run } = useAction();

  const players = useMemo(() => new Map<number, PublicUser>((ev?.players ?? []).map((p) => [p.id, p])), [ev]);
  if (loading || !ev) return <Spinner />;

  const lines = Math.max(3, ...ev.lineup.map((l) => l.line));
  const split = ev.lineup.some((l) => l.team !== '');
  const hasLineup = ev.lineup.length > 0;
  const myLine = ev.lineup.find((l) => l.user_id === me.user.id);
  const team: Team = split ? (teamView ?? (myLine?.team || 'dark')) : '';
  const isPast = new Date(ev.starts_at).getTime() < Date.now();

  return (
    <div className="page">
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="chips" style={{ marginBottom: 8 }}>
              <span className={`chip ${ev.type === 'game' ? 'game' : 'info'}`}>{ev.type === 'game' ? 'Игра' : 'Тренировка'}</span>
              {ev.squads.map((s) => (
                <SquadChip key={s.id} squad={s} full />
              ))}
              {ev.cancelled && <span className="chip bad">Отменено</span>}
              {ev.score_us != null && ev.score_them != null && (
                <span className={`chip ${ev.score_us > ev.score_them ? 'ok' : ev.score_us < ev.score_them ? 'bad' : ''}`}>
                  {ev.score_us}:{ev.score_them}
                </span>
              )}
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800 }}>{typeLabel(ev)}</h1>
          </div>
          {ev.canEdit && (
            <button className="icon-btn" onClick={() => nav(`/events/${ev.id}/edit`)} aria-label="Редактировать">
              <Pencil size={18} />
            </button>
          )}
        </div>
        <div className="vstack" style={{ gap: 6 }}>
          <div className="hstack small">
            <Clock size={16} color="var(--falcon)" />
            <span>{fmt.dayLong(ev.starts_at)}</span>, {fmt.time(ev.starts_at)}
            <span className="muted">· {ev.duration_min} мин</span>
          </div>
          {ev.location && (
            <div className="hstack small">
              <MapPin size={16} color="var(--falcon)" /> {ev.location}
            </div>
          )}
          {ev.notes && (
            <div className="hstack small" style={{ alignItems: 'flex-start' }}>
              <StickyNote size={16} color="var(--falcon)" style={{ flex: 'none', marginTop: 1 }} /> {ev.notes}
            </div>
          )}
        </div>
        {me.user.signup_blocked && ev.my !== 'in' && !isPast && (
          <div className="alert bad">
            <Ban size={18} />
            <div className="body">Запись закрыта до оплаты взноса</div>
          </div>
        )}
        <SignupButtons ev={ev} onChange={() => void reload()} />
        {myLine && (
          <div className="alert info">
            <LayoutGrid size={18} />
            <div className="body">
              <b>
                {myLine.line === 0
                  ? `Ты в воротах${myLine.team ? ` у ${TEAM_GEN[myLine.team]}` : ''}`
                  : `Ты ${myLine.line === 2 ? 'во' : 'в'} ${ORD[myLine.line]} пятёрке${myLine.team ? ` ${TEAM_GEN[myLine.team]}` : ''}`}
              </b>
            </div>
          </div>
        )}
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ['roster', `Идут · ${ev.players.length}`],
          ['lines', 'Пятёрки'],
        ]}
      />

      {tab === 'roster' ? (
        <>
          {ev.players.length ? (
            <div className="list">
              {ev.players.map((p, i) => (
                <div key={p.id} className="row">
                  <span className="muted small num" style={{ width: 18 }}>
                    {i + 1}
                  </span>
                  <Avatar user={p} />
                  <div className="grow">
                    <div className="title">{p.name}</div>
                    <div className="meta">{p.position ? POS_SHORT[p.position] : 'позиция не указана'}</div>
                  </div>
                  {p.reserve && <span className="chip warn">резерв</span>}
                  <Jersey n={p.number} />
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<Users size={26} />} title="Пока никто не записался" />
          )}
          {ev.notGoing.length > 0 && (
            <>
              <div className="section-title">Не идут · {ev.notGoing.length}</div>
              <div className="card tight">
                <div className="chips">
                  {ev.notGoing.map((p) => (
                    <span key={p.id} className="chip">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {ev.canEdit && (
            <div className="btn-row">
              <button className="btn" onClick={() => nav(`/events/${ev.id}/lineup`)}>
                <LayoutGrid size={18} /> {hasLineup ? 'Изменить пятёрки' : 'Распределить по пятёркам'}
              </button>
            </div>
          )}
          {ev.canEdit && hasLineup && !ev.lineup_published && (
            <div className="alert warn">
              <div className="body">Черновик — игроки пока не видят пятёрки.</div>
            </div>
          )}
          {hasLineup && split && (
            <Segmented
              value={team as 'dark' | 'light'}
              onChange={setTeamView}
              options={[
                ['dark', '⚫️ Тёмные'],
                ['light', '⚪️ Светлые'],
              ]}
            />
          )}
          {hasLineup ? (
            <Lines team={team} lines={lines} lineup={ev.lineup} players={players} myId={me.user.id} />
          ) : (
            <Empty icon={<LayoutGrid size={26} />} title="Пятёрки ещё не готовы">
              Тренер распределит игроков ближе к {ev.type === 'game' ? 'игре' : 'тренировке'}.
            </Empty>
          )}
        </>
      )}

      {ev.canEdit && !ev.cancelled && !isPast && (
        <button
          className="btn bad-soft block"
          disabled={busy}
          onClick={() =>
            confirm('Отменить событие?') &&
            run(async () => {
              await api.patch(`/api/events/${ev.id}`, { cancelled: 1 });
              await reload();
            }, 'Событие отменено')
          }
        >
          Отменить событие
        </button>
      )}
    </div>
  );
}
