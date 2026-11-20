import { t } from '@shared/i18n';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, CalendarPlus, ChevronRight, Receipt, Scissors, UserPlus } from 'lucide-react';
import type { EventSummary, FinanceData } from '@shared/api';
import { DUE_STATUS, fmt, PLAN_LABEL } from '@shared/format';
import { can, Empty, useApi, useMe } from '@shared/ui';
import EventCard from './EventCard';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tbilisi', hour: 'numeric', hour12: false }).format(new Date()));
  if (h < 5) return t('Доброй ночи');
  if (h < 12) return t('Доброе утро');
  if (h < 18) return t('Добрый день');
  return t('Добрый вечер');
}

export default function Home() {
  const { me } = useMe();
  const nav = useNavigate();
  const events = useApi<EventSummary[]>('/api/events');
  const fin = useApi<FinanceData>('/api/finance');
  const stats = useApi<{ trainingsMonth: number; attendanceRate30: number | null; streak: number }>('/api/me/stats');

  const upcoming = (events.data ?? []).filter((e) => !e.cancelled);
  const next = upcoming.slice(0, 3);
  const current = fin.data?.items[0];
  const debt = (me.debts ?? []).reduce((s, d) => s + d.amount, 0);
  const b = me.badges ?? {};

  const update = (e: EventSummary) => events.setData((list) => list?.map((x) => (x.id === e.id ? e : x)) ?? null);

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-top">
          <div className="hero-logo">
            <img src="/logo.png" alt="" />
          </div>
          <div>
            <div className="eyebrow">Falcons HC</div>
            <h1>
              {greeting()}, {me.user.first_name}
            </h1>
          </div>
          <button className="icon-btn" style={{ marginLeft: 'auto', position: 'relative', background: 'rgba(255,255,255,0.18)', color: '#fff' }} onClick={() => nav('/notifications')} aria-label={t('Уведомления')}>
            <Bell size={19} />
            {!!me.badges?.unread && <span className="dot-badge">{me.badges.unread}</span>}
          </button>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <b>{stats.data?.trainingsMonth ?? '–'}</b>
            <span>{t('трен. в месяце')}</span>
          </div>
          <div className="hero-stat">
            <b>{stats.data?.attendanceRate30 != null ? `${stats.data.attendanceRate30}%` : '–'}</b>
            <span>{t('посещаемость')}</span>
          </div>
          <div className="hero-stat">
            <b>{stats.data?.streak ?? '–'}</b>
            <span>{t('серия 🔥')}</span>
          </div>
        </div>
      </div>

      {me.sharpeningDebt && (
        <div className="alert warn clickable" onClick={() => nav('/sharpening')} style={{ cursor: 'pointer' }}>
          <AlertTriangle size={22} />
          <div className="body">
            <b>{t('Долг за заточку')} {fmt.gel(me.sharpeningDebt.total)}</b>
            {t('Оплати и прикрепи скрин.')}
          </div>
          <ChevronRight size={20} />
        </div>
      )}

      {debt > 0 && (
        <div className="alert bad clickable" onClick={() => nav('/finance')} style={{ cursor: 'pointer' }}>
          <AlertTriangle size={22} />
          <div className="body">
            <b>{t('Долг')} {fmt.gel(debt)}</b>
            {me.user.signup_blocked ? t('Запись на тренировки закрыта до оплаты.') : t('Оплати и прикрепи скрин — админ проверит.')}
          </div>
          <ChevronRight size={20} />
        </div>
      )}

      <button className="home-shop" onClick={() => nav('/shop')}>
        <span className="home-shop-ic">🏆</span>
        <span className="grow" style={{ textAlign: 'left' }}>
          <b>{t('Магазин ачивок')}</b>
          <span className="muted small" style={{ display: 'block' }}>{t('Огненные ники и светящиеся рамки для аватарки')}</span>
        </span>
        <ChevronRight size={20} />
      </button>

      <div className="section-title">
        {t('Ближайшие')}
        <button onClick={() => nav('/events')}>{t('Все')}</button>
      </div>
      {events.loading ? (
        <div className="skeleton" style={{ height: 150 }} />
      ) : next.length ? (
        next.map((e) => <EventCard key={e.id} ev={e} onChange={update} compact />)
      ) : (
        <div className="card">
          <Empty icon={<CalendarPlus size={26} />} title={t('Пока ничего не запланировано')}>
            {t('Как только тренер создаст тренировку — бот напишет в чат.')}
          </Empty>
        </div>
      )}

      {current && (
        <>
          <div className="section-title">{t('Взнос')}</div>
          <div className="card clickable" onClick={() => nav('/finance')}>
            <div className="between">
              <div>
                <div className="muted small">{fmt.month(current.period.month)}</div>
                <div style={{ fontSize: 22, fontWeight: 800 }} className="num">
                  {current.due?.plan === 'exempt' && current.due.custom_amount == null
                    ? t('Освобождён 🙌')
                    : !current.due?.plan && current.due?.custom_amount == null
                    ? t('Выбери вариант')
                    : current.period.locked
                      ? fmt.gel(current.due?.amount)
                      : t('Ждём всех 🧮')}
                </div>
                <div className="muted small">
                  {current.due?.plan ? PLAN_LABEL[current.due.plan] : t('Взнос не выбран')}
                  {!current.period.locked && current.due?.plan && current.due.plan !== 'exempt' ? t(' · сумма придёт, когда начнётся сбор') : ''}
                </div>
              </div>
              {current.due && current.period.locked && current.due.plan !== 'exempt' && (
                <span className={`chip ${DUE_STATUS[current.due.status].tone}`}>{DUE_STATUS[current.due.status].label}</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StaffRow({ icon, title, count, to }: { icon: React.ReactNode; title: string; count?: number; to: string }) {
  const nav = useNavigate();
  return (
    <button className="row" onClick={() => nav(to)}>
      <span style={{ color: 'var(--falcon)' }}>{icon}</span>
      <div className="grow">
        <div className="title">{title}</div>
      </div>
      {count ? <span className="chip bad">{count}</span> : null}
      <ChevronRight className="chev" size={18} />
    </button>
  );
}
