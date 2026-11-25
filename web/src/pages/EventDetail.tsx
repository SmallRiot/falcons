import { t } from '@shared/i18n';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ban, BellRing, Clock, LayoutGrid, MapPin, Pencil, StickyNote, UserPlus, Users, X } from 'lucide-react';
import { GuestAdd } from '@shared/GuestAdd';
import { api, type EventDetail as ED, type PublicUser, type Team } from '@shared/api';
import { DEFAULT_LOCATION, fmt, POS_SHORT } from '@shared/format';
import { Nick, ask, Avatar, Empty, Jersey, Segmented, Sheet, Spinner, SquadChip, useAction, useApi, useMe, UserTags } from '@shared/ui';
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
  const [guestOpen, setGuestOpen] = useState(false);

  const players = useMemo(() => new Map<number, PublicUser>((ev?.players ?? []).map((p) => [p.id, p])), [ev]);
  if (loading || !ev) return <Spinner />;

  const rosterGroups = [
    { key: 'skaters', players: ev.players.filter(p => p.position !== 'G') },
    { key: 'goalies', players: ev.players.filter(p => p.position === 'G') },
  ];
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
              <span className={`chip ${ev.type === 'game' ? 'game' : 'info'}`}>{ev.type === 'game' ? t('Игра') : t('Тренировка')}</span>
              {ev.squads.map((s) => (
                <SquadChip key={s.id} squad={s} full />
              ))}
              {ev.cancelled && <span className="chip bad">{t('Отменено')}</span>}
              {ev.score_us != null && ev.score_them != null && (
                <span className={`chip ${ev.score_us > ev.score_them ? 'ok' : ev.score_us < ev.score_them ? 'bad' : ''}`}>
                  {ev.score_us}:{ev.score_them}
                </span>
              )}
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800 }}>{typeLabel(ev)}</h1>
          </div>
          {ev.canEdit && (
            <button className="icon-btn" onClick={() => nav(`/events/${ev.id}/edit`)} aria-label={t('Редактировать')}>
              <Pencil size={18} />
            </button>
          )}
        </div>
        <div className="vstack" style={{ gap: 6 }}>
          <div className="hstack small">
            <Clock size={16} color="var(--falcon)" />
            <span>{fmt.dayLong(ev.starts_at)}</span>, {fmt.time(ev.starts_at)}
            <span className="muted">· {ev.duration_min} {t('мин')}</span>
          </div>
          {ev.location && (
            <div className="hstack small">
              <MapPin size={16} color="var(--falcon)" /> {ev.location === DEFAULT_LOCATION ? t(DEFAULT_LOCATION) : ev.location}
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
            <div className="body">{t('Запись закрыта до оплаты взноса')}</div>
          </div>
        )}
        <SignupButtons ev={ev} onChange={() => void reload()} />
        {myLine && (
          <div className="alert info">
            <LayoutGrid size={18} />
            <div className="body">
              <b>
                {myLine.line === 0
                  ? t('Ты в воротах{0}', myLine.team ? t(' у {0}', TEAM_GEN[myLine.team]) : '')
                  : t('Ты {0} {1} пятёрке{2}', myLine.line === 2 ? t('во') : t('в'), ORD[myLine.line], myLine.team ? t(' {0}', TEAM_GEN[myLine.team]) : '')}
              </b>
            </div>
          </div>
        )}
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ['roster', t('Идут · {0}', ev.going)],
          ['lines', t('Пятёрки')],
        ]}
      />

      {ev.rosterHidden ? (
        <Empty icon={<Users size={26} />} title={t('Идут: {0}', ev.going)}>
          {t('Кто записался и пятёрки на игру видят только игроки этого состава.')}
        </Empty>
      ) : tab === 'roster' ? (
        <>
          {ev.canEdit && !ev.cancelled && !isPast && (
            <div className="btn-row">
              <button
                className="btn secondary"
                disabled={busy}
                onClick={async () =>
                  (await ask(t('Напомнить в чате? Пост события придёт новым сообщением внизу топика.'), { okText: t('Напомнить') })) &&
                  run(() => api.post(`/api/events/${ev.id}/remind`), t('Напомнили в чате 🔔'))
                }
              >
                <BellRing size={18} /> {t('Напомнить')}
              </button>
              <button className="btn secondary" onClick={() => setGuestOpen(true)}>
                <UserPlus size={18} /> {t('Гость')}
              </button>
            </div>
          )}
          {rosterGroups.filter(group => group.players.length > 0).map(group => (
            <section className="event-roster-group" key={group.key}>
              {group.key === 'goalies' && <h2 className="section-title">{t('Вратари')} · {group.players.length}</h2>}
              <div className="list">
                {group.players.map((p, i) => (
                  <div key={p.id} className="row">
                    <span className="muted small num" style={{ width: 18 }}>
                      {i + 1}
                    </span>
                    <Avatar user={p} />
                    <div className="grow">
                      <div className="title"><Nick user={p} text={p.name} /></div>
                      <div className="meta hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <span>{p.position ? POS_SHORT[p.position] : t('позиция не указана')}</span>
                        <UserTags user={p} />
                      </div>
                    </div>
                    {p.reserve && <span className="chip warn">{t('резерв')}</span>}
                    {p.guest && ev.canEdit ? (
                      <button
                        className="icon-btn"
                        aria-label={t('Убрать гостя')}
                        disabled={busy}
                        onClick={async () =>
                          (await ask(t('Убрать гостя {0} с события?', p.name), { okText: t('Убрать'), danger: true })) &&
                          run(async () => {
                            await api.del(`/api/events/${ev.id}/guests/${p.id}`);
                            await reload();
                          }, t('Гость убран'))
                        }
                      >
                        <X size={16} />
                      </button>
                    ) : (
                      <Jersey n={p.number} />
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
          {!ev.players.length && (
            <Empty icon={<Users size={26} />} title={t('Пока никто не записался')} />
          )}
          {ev.notGoing.length > 0 && (
            <details className="event-declines" key={ev.id}>
              <summary className="section-title">{t('Не идут ·')} {ev.notGoing.length}</summary>
              <div className="card tight">
                <div className="chips">
                  {ev.notGoing.map((p) => (
                    <span key={p.id} className="chip">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            </details>
          )}
        </>
      ) : (
        <>
          {ev.canEdit && (
            <div className="btn-row">
              <button className="btn" onClick={() => nav(`/events/${ev.id}/lineup`)}>
                <LayoutGrid size={18} /> {hasLineup ? t('Изменить пятёрки') : t('Распределить по пятёркам')}
              </button>
            </div>
          )}
          {ev.canEdit && hasLineup && !ev.lineup_published && (
            <div className="alert warn">
              <div className="body">{t('Черновик — игроки пока не видят пятёрки.')}</div>
            </div>
          )}
          {hasLineup && split && (
            <Segmented
              value={team as 'dark' | 'light'}
              onChange={setTeamView}
              options={[
                ['dark', t('⚫️ Тёмные')],
                ['light', t('⚪️ Светлые')],
              ]}
            />
          )}
          {hasLineup ? (
            <Lines team={team} lines={lines} lineup={ev.lineup} players={players} myId={me.user.id} />
          ) : (
            <Empty icon={<LayoutGrid size={26} />} title={t('Пятёрки ещё не готовы')}>
              {t('Тренер распределит игроков ближе к')} {ev.type === 'game' ? t('игре') : t('тренировке')}.
            </Empty>
          )}
        </>
      )}

      {ev.canEdit && !ev.cancelled && !isPast && (
        <button
          className="btn bad-soft block"
          disabled={busy}
          onClick={async () =>
            await ask(t('Отменить событие?')) &&
            run(async () => {
              await api.patch(`/api/events/${ev.id}`, { cancelled: 1 });
              await reload();
            }, t('Событие отменено'))
          }
        >
          {t('Отменить событие')}
        </button>
      )}
      {ev.canEdit && (
        <Sheet open={guestOpen} onClose={() => setGuestOpen(false)} title={t('Гость на событие')}>
          {guestOpen && <GuestAdd eventId={ev.id} already={ev.players.map((p) => p.id)} onAdded={reload} />}
        </Sheet>
      )}
    </div>
  );
}
