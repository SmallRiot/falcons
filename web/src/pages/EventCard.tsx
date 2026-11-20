import { locale, t } from '@shared/i18n';
import { useNavigate } from 'react-router-dom';
import { FeePay } from './FeePay';
import { Check, Clock, MapPin, X } from 'lucide-react';
import { api, type EventSummary } from '@shared/api';
import { DEFAULT_LOCATION, fmt } from '@shared/format';
import { haptic } from '@shared/tg';
import { Avatar, SquadChip, toastErr, useMe } from '@shared/ui';
import { useState } from 'react';

export function typeLabel(e: { type: string; title: string | null }) {
  return e.type === 'game' ? (e.title ? e.title : t('Игра')) : e.title || t('Тренировка');
}

export function DateTile({ iso, game }: { iso: string; game?: boolean }) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Tbilisi', day: 'numeric' }).format(d);
  const mon = new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Tbilisi', month: 'short' }).format(d).replace('.', '');
  return (
    <div className={`date-tile ${game ? 'game' : ''}`}>
      <div className="d">{day}</div>
      <div className="m">{mon}</div>
    </div>
  );
}

export function SignupButtons({ ev, onChange }: { ev: EventSummary; onChange: (e: EventSummary) => void }) {
  const { me, refresh } = useMe();
  const [busy, setBusy] = useState(false);
  const [payNow, setPayNow] = useState(false);
  const set = async (status: 'in' | 'out') => {
    haptic.tap();
    setBusy(true);
    try {
      const next = await api.post<EventSummary>(`/api/events/${ev.id}/signup`, { status: ev.my === status ? null : status });
      // гость записался — сразу окно оплаты выхода
      if (next.myFee?.status === 'unpaid' && !ev.myFee) setPayNow(true);
      onChange(next);
      haptic.ok();
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  };
  if (ev.cancelled) return <div className="chip bad">{t('Отменено')}</div>;
  if (new Date(ev.starts_at).getTime() < Date.now()) return null;
  const blocked = me.user.signup_blocked && ev.my !== 'in';
  return (
    <div className="signup-btns" onClick={(e) => e.stopPropagation()}>
      <button className={`btn sm ${ev.my === 'in' ? 'in-on' : 'secondary'}`} disabled={busy || blocked} onClick={() => set('in')}>
        <Check size={17} /> {ev.my === 'in' ? (ev.myReserve ? t('В резерве') : t('Иду')) : t('Иду')}
      </button>
      <button className={`btn sm ${ev.my === 'out' ? 'out-on' : 'ghost'}`} disabled={busy} onClick={() => set('out')}>
        <X size={17} /> {t('Не иду')}
      </button>
      {ev.myFee && ev.my === 'in' && (
        <div style={{ flexBasis: '100%' }}>
          <FeePay
            key={`${ev.id}-${payNow}`}
            ev={ev}
            autoOpen={payNow}
            onDone={async () => {
              setPayNow(false);
              onChange(await api.get<EventSummary>(`/api/events/${ev.id}`));
              await refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function EventCard({ ev, onChange, compact }: { ev: EventSummary; onChange: (e: EventSummary) => void; compact?: boolean }) {
  const nav = useNavigate();
  const fill = ev.capacity ? Math.min(100, (ev.going / ev.capacity) * 100) : 0;
  return (
    <div className="card clickable event-card" onClick={() => nav(`/events/${ev.id}`)}>
      <div className="event-top">
        <DateTile iso={ev.starts_at} game={ev.type === 'game'} />
        <div className="event-info">
          <div className="t">
            {typeLabel(ev)}
            {ev.type === 'game' && <span className="chip game">{t('Игра')}</span>}
            {ev.squads.map((s) => (
              <SquadChip key={s.id} squad={s} />
            ))}
            {ev.lineup_published && <span className="chip info">{t('Пятёрки')}</span>}
          </div>
          <div className="m">
            <Clock size={13} /> {fmt.day(ev.starts_at)}, {fmt.time(ev.starts_at)}
            <span>· {fmt.relative(ev.starts_at)}</span>
          </div>
          {ev.location && !compact && (
            <div className="m">
              <MapPin size={13} /> {ev.location === DEFAULT_LOCATION ? t(DEFAULT_LOCATION) : ev.location}
            </div>
          )}
        </div>
      </div>
      <div className="event-bottom">
        <div className="stack">
          {ev.avatars.slice(0, 4).map((a) => (
            <Avatar key={a.id} user={a} size="sm" />
          ))}
        </div>
        <span className="small num" style={{ fontWeight: 650 }}>
          {ev.going}
          {ev.capacity ? ` / ${ev.capacity}` : ''} {t('идут')}
        </span>
        {ev.capacity ? (
          <div className="progress">
            <div style={{ width: `${fill}%` }} />
          </div>
        ) : (
          <div className="spacer" />
        )}
      </div>
      <SignupButtons ev={ev} onChange={onChange} />
    </div>
  );
}
