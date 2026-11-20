import { t } from '@shared/i18n';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarX, Plus } from 'lucide-react';
import type { EventSummary } from '@shared/api';
import { fmt } from '@shared/format';
import { can, Empty, Segmented, Spinner, SquadChip, useApi, useMe } from '@shared/ui';
import EventCard, { DateTile, typeLabel } from './EventCard';

export default function Events() {
  const { me } = useMe();
  const nav = useNavigate();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [type, setType] = useState<'all' | 'training' | 'game'>('all');
  const staff = can(me, 'coach', 'admin');
  // «mine» — тренировки + игры моих составов; число — игры конкретного состава; «all» — всё (для тренера и админа)
  const [squad, setSquad] = useState<'mine' | 'all' | number>('mine');
  const { data, loading, setData } = useApi<EventSummary[]>(`/api/events?scope=${scope}${staff ? '&all=1' : ''}`, [scope, staff]);
  const mySquads = me.user.squads ?? [];
  const isMine = (e: EventSummary) => !e.squads.length || e.squads.some((s) => mySquads.includes(s.id));
  const list = (data ?? [])
    .filter((e) => type === 'all' || e.type === type)
    .filter((e) => (squad === 'all' ? true : squad === 'mine' ? isMine(e) : e.squads.some((s) => s.id === squad)));
  const squadOptions = (me.squads ?? []).filter((s) => staff || mySquads.includes(s.id));
  const update = (e: EventSummary) => setData((l) => l?.map((x) => (x.id === e.id ? e : x)) ?? null);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('События')}</h1>
      </div>
      <Segmented value={scope} onChange={setScope} options={[['upcoming', t('Предстоящие')], ['past', t('Прошедшие')]]} />
      <div className="chips">
        {(
          [
            ['all', t('Все')],
            ['training', t('Тренировки')],
            ['game', t('Игры')],
          ] as const
        ).map(([v, l]) => (
          <button key={v} className={`chip ${type === v ? 'info' : ''}`} style={{ border: 0, height: 30, padding: '0 12px' }} onClick={() => setType(v)}>
            {l}
          </button>
        ))}
      </div>
      {(squadOptions.length > 1 || staff) && (
        <div className="chips">
          <button className={`chip ${squad === 'mine' ? 'info' : ''}`} style={{ border: 0, height: 30, padding: '0 12px' }} onClick={() => setSquad('mine')}>
            {t('Мои')}
          </button>
          {squadOptions.map((s) => (
            <button
              key={s.id}
              className="chip"
              style={{ border: 0, height: 30, padding: '0 12px', background: squad === s.id ? s.color : `${s.color}1f`, color: squad === s.id ? '#fff' : s.color }}
              onClick={() => setSquad(s.id)}
            >
              {s.short}
            </button>
          ))}
          {staff && (
            <button className={`chip ${squad === 'all' ? 'info' : ''}`} style={{ border: 0, height: 30, padding: '0 12px' }} onClick={() => setSquad('all')}>
              {t('Весь клуб')}
            </button>
          )}
        </div>
      )}
      {loading ? (
        <Spinner />
      ) : !list.length ? (
        <Empty icon={<CalendarX size={26} />} title={scope === 'upcoming' ? t('Ничего не запланировано') : t('Пока пусто')} />
      ) : scope === 'upcoming' ? (
        list.map((e) => <EventCard key={e.id} ev={e} onChange={update} />)
      ) : (
        <div className="list">
          {list.map((e) => (
            <button key={e.id} className="row" onClick={() => nav(`/events/${e.id}`)}>
              <DateTile iso={e.starts_at} game={e.type === 'game'} />
              <div className="grow">
                <div className="title hstack" style={{ gap: 6 }}>
                  {typeLabel(e)}
                  {e.squads.map((s) => (
                    <SquadChip key={s.id} squad={s} />
                  ))}
                </div>
                <div className="meta">
                  {fmt.time(e.starts_at)} · {e.going} {t('было')}
                  {e.score_us != null && e.score_them != null ? ` · ${e.score_us}:${e.score_them}` : ''}
                </div>
              </div>
              {e.cancelled ? (
                <span className="chip bad">{t('Отменено')}</span>
              ) : e.my === 'in' ? (
                <span className="chip ok">{t('Был')}</span>
              ) : (
                <span className="chip">{t('Пропуск')}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {can(me, 'coach', 'admin') && (
        <button className="fab" onClick={() => nav('/events/new')} aria-label={t('Новое событие')}>
          <Plus size={26} />
        </button>
      )}
    </div>
  );
}
