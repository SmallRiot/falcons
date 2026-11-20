import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarX, Plus } from 'lucide-react';
import type { EventSummary } from '../api';
import { fmt } from '../format';
import { can, Empty, Segmented, Spinner, useApi, useMe } from '../ui';
import EventCard, { DateTile, typeLabel } from './EventCard';

export default function Events() {
  const { me } = useMe();
  const nav = useNavigate();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [type, setType] = useState<'all' | 'training' | 'game'>('all');
  const { data, loading, setData } = useApi<EventSummary[]>(`/api/events?scope=${scope}`, [scope]);
  const list = (data ?? []).filter((e) => type === 'all' || e.type === type);
  const update = (e: EventSummary) => setData((l) => l?.map((x) => (x.id === e.id ? e : x)) ?? null);

  return (
    <div className="page">
      <div className="page-head">
        <h1>События</h1>
      </div>
      <Segmented value={scope} onChange={setScope} options={[['upcoming', 'Предстоящие'], ['past', 'Прошедшие']]} />
      <div className="chips">
        {(
          [
            ['all', 'Все'],
            ['training', 'Тренировки'],
            ['game', 'Игры'],
          ] as const
        ).map(([v, l]) => (
          <button key={v} className={`chip ${type === v ? 'info' : ''}`} style={{ border: 0, height: 30, padding: '0 12px' }} onClick={() => setType(v)}>
            {l}
          </button>
        ))}
      </div>
      {loading ? (
        <Spinner />
      ) : !list.length ? (
        <Empty icon={<CalendarX size={26} />} title={scope === 'upcoming' ? 'Ничего не запланировано' : 'Пока пусто'} />
      ) : scope === 'upcoming' ? (
        list.map((e) => <EventCard key={e.id} ev={e} onChange={update} />)
      ) : (
        <div className="list">
          {list.map((e) => (
            <button key={e.id} className="row" onClick={() => nav(`/events/${e.id}`)}>
              <DateTile iso={e.starts_at} game={e.type === 'game'} />
              <div className="grow">
                <div className="title">{typeLabel(e)}</div>
                <div className="meta">
                  {fmt.time(e.starts_at)} · {e.going} было
                </div>
              </div>
              {e.cancelled ? (
                <span className="chip bad">Отменено</span>
              ) : e.my === 'in' ? (
                <span className="chip ok">Был</span>
              ) : (
                <span className="chip">Пропуск</span>
              )}
            </button>
          ))}
        </div>
      )}
      {can(me, 'coach', 'admin') && (
        <button className="fab" onClick={() => nav('/events/new')} aria-label="Новое событие">
          <Plus size={26} />
        </button>
      )}
    </div>
  );
}
