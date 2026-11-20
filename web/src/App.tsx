import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Home as HomeIcon, Scissors, User, Wallet, AlertTriangle, FlaskConical, ShieldCheck, Receipt, Users, LayoutGrid, ArrowLeftRight, ChevronLeft } from 'lucide-react';
import { api, ApiError, getDevUser, type Me } from '@shared/api';
import { inTelegram, startParam, tg } from '@shared/tg';
import { can, MeCtx, Sheet, Spinner, Toaster } from '@shared/ui';
import { fmt } from '@shared/format';
import { startRoute } from '@shared/nav';
import Gate, { DevPicker } from './pages/Gate';
import Home from './pages/Home';
import Events from './pages/Events';
import EventDetail from './pages/EventDetail';
import EventForm from './pages/EventForm';
import LineupEditor from './pages/LineupEditor';
import Finance from './pages/Finance';
import Sharpening from './pages/Sharpening';
import Profile from './pages/Profile';
import AdminUsers from './pages/AdminUsers';
import AdminFinance from './pages/AdminFinance';
import AdminAccounts from './pages/AdminAccounts';
import Service from './pages/Service';
import Notifications from './pages/Notifications';
import AdminSquads from './pages/AdminSquads';
import Onboarding from './pages/Onboarding';
import Manage from './pages/Manage';
import AdminFees from './pages/AdminFees';
import SquadMembers from './pages/SquadMembers';


const ROOTS = ['/', '/events', '/finance', '/sharpening', '/profile', '/manage', '/admin/users', '/admin/finance', '/service', '/service/queue', '/service/debts'];
/** Экраны режима «Управление». /events общий — режим не меняет. */
const STAFF_PATH = /^\/(manage|admin|service)(\/|$)/;
const MODE_KEY = 'falcons.mode';
type Mode = 'player' | 'staff';
/** Сохранённый режим; если не выбирали — у админа/тренера/сервиса по умолчанию «Управление». */
const readMode = (): Mode | null => {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'staff' || v === 'player' ? v : null;
  } catch {
    return null;
  }
};


export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<{ status: number; message: string } | null>(null);
  // мини-приложение живёт в Telegram; в браузере — только тестовый вход (DEV_AUTH=1)
  const [needDev, setNeedDev] = useState(!inTelegram && !getDevUser());
  const [debtOpen, setDebtOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setModeState] = useState<Mode | null>(() => (STAFF_PATH.test(location.hash.slice(1)) ? 'staff' : readMode()));
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* приватный режим — просто не запомним */
    }
  };
  // у админа/тренера/сервиса главная — «Управление» (если сам не переключился в игрока)
  useEffect(() => {
    if (!me || !can(me, 'admin', 'coach', 'service') || mode === 'player') return;
    const home = can(me, 'admin', 'coach') ? '/manage' : '/service';
    if (loc.pathname === '/' || (loc.pathname === '/manage' && home !== '/manage')) nav(home, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.user.id, loc.pathname]);

  // ссылка из бота на админский экран сама включает режим управления
  useEffect(() => {
    if (STAFF_PATH.test(loc.pathname) && mode !== 'staff') setMode('staff');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/api/me'));
      setErr(null);
    } catch (e) {
      setErr({ status: e instanceof ApiError ? e.status : 0, message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    if (needDev) return;
    void refresh().then(() => {
      const r = startRoute(startParam);
      if (r) nav(r, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needDev]);

  // долг показываем при каждом открытии приложения
  const hasDebt = !!me?.debts?.length || !!me?.sharpeningDebt || !!me?.guestDebt;
  useEffect(() => {
    if (hasDebt) setDebtOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.user.id, hasDebt]);

  // «Назад»: нативная кнопка Telegram в шапке; в браузере — такая же сверху слева.
  // Если открыли сразу по ссылке и истории нет — на главную текущего режима.
  const isRoot = ROOTS.includes(loc.pathname);
  const goBack = useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) nav(-1);
    else nav(me && can(me, 'admin', 'coach', 'service') && mode !== 'player' ? (can(me, 'admin', 'coach') ? '/manage' : '/service') : '/', { replace: true });
  }, [nav, mode, me]);
  useEffect(() => {
    if (!tg) return;
    if (isRoot) {
      tg.BackButton.hide();
      return;
    }
    tg.BackButton.show();
    tg.BackButton.onClick(goBack);
    return () => tg!.BackButton.offClick(goBack);
  }, [isRoot, goBack]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  if (needDev) return <DevPicker onPick={() => setNeedDev(false)} />;
  if (err) return <Gate kind="error" message={err.message} onRetry={refresh} onDev={() => setDevOpen(true)} devOpen={devOpen} setDevOpen={setDevOpen} />;
  if (!me) return <Spinner />;
  if (me.user.status !== 'active')
    return <Gate kind={me.user.status} me={me} onRetry={refresh} onDev={() => setDevOpen(true)} devOpen={devOpen} setDevOpen={setDevOpen} />;

  const duesDebt = (me.debts ?? []).reduce((s, d) => s + d.amount, 0);
  const debtTotal = duesDebt + (me.sharpeningDebt?.total ?? 0) + (me.guestDebt?.total ?? 0);
  const staffBadge = (me.badges?.pendingUsers ?? 0) + (me.badges?.proofs ?? 0) + (me.badges?.fees ?? 0) + (me.badges?.sharpenings ?? 0);
  const isStaff = can(me, 'admin', 'coach', 'service');
  const staffMode = isStaff && (mode ?? 'staff') === 'staff';
  const staffLabel = can(me, 'admin') ? 'Админка' : can(me, 'coach') ? 'Тренер' : 'Заточка';
  // точильщик без других ролей: своя простая панель — чеки, очередь, долги
  const serviceOnly = can(me, 'service') && !can(me, 'admin', 'coach');
  const staffHome = serviceOnly ? '/service' : '/manage';
  const switchTo = (next: Mode) => {
    setMode(next);
    nav(next === 'staff' ? staffHome : '/', { replace: true });
  };

  const routes = (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/events" element={<Events />} />
      <Route path="/events/new" element={<EventForm />} />
      <Route path="/events/:id" element={<EventDetail />} />
      <Route path="/events/:id/edit" element={<EventForm />} />
      <Route path="/events/:id/lineup" element={<LineupEditor />} />
      <Route path="/finance" element={<Finance />} />
      <Route path="/sharpening" element={<Sharpening />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/admin/users" element={<AdminUsers />} />
      <Route path="/admin/finance" element={<AdminFinance />} />
      <Route path="/admin/accounts" element={<AdminAccounts />} />
      <Route path="/service" element={<Service />} />
      <Route path="/service/:tab" element={<Service />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/admin/squads" element={<AdminSquads />} />
      <Route path="/admin/fees" element={<AdminFees />} />
      <Route path="/manage/squads" element={<SquadMembers />} />
      <Route path="/manage" element={isStaff ? <Manage /> : <Home />} />
      <Route path="*" element={staffMode ? <Manage /> : <Home />} />
    </Routes>
  );

  return (
    <MeCtx.Provider value={{ me, refresh }}>
      <div className={`app ${inTelegram ? '' : 'dev'} ${isStaff ? 'top' : ''}`}>
        {routes}
      </div>

      <nav className={`tabbar ${staffMode ? 'staff' : ''}`}>
        <div className="tabbar-inner">
          {staffMode ? (
            <>
              {serviceOnly ? (
                <>
                  <Tab to="/service" end icon={<Receipt size={22} />} label="Чеки" dot={me.badges?.sharpChecks || undefined} />
                  <Tab to="/service/queue" icon={<Scissors size={22} />} label="Очередь" dot={me.badges?.sharpQueue || undefined} />
                  <Tab to="/service/debts" icon={<Wallet size={22} />} label="Долги" />
                </>
              ) : (
              <Tab to="/manage" icon={<LayoutGrid size={22} />} label="Обзор" />
              )}
              {can(me, 'admin', 'coach') && <Tab to="/events" icon={<CalendarDays size={22} />} label="События" />}
              {can(me, 'admin') && <Tab to="/admin/users" icon={<Users size={22} />} label="Люди" dot={me.badges?.pendingUsers || undefined} />}
              {can(me, 'admin') && <Tab to="/admin/finance" icon={<Receipt size={22} />} label="Взносы" dot={me.badges?.proofs || undefined} />}
              {!serviceOnly && can(me, 'admin', 'service') && <Tab to="/service" icon={<Scissors size={22} />} label="Заточка" dot={me.badges?.sharpenings || undefined} />}
            </>
          ) : (
            <>
              <Tab to="/" icon={<HomeIcon size={22} />} label="Главная" end />
              <Tab to="/events" icon={<CalendarDays size={22} />} label="События" />
              {/* гость платит за выходы, взносов у него нет (если не остался старый долг) */}
              {(me.guest_price == null || !!me.debts?.length) && (
                <Tab to="/finance" icon={<Wallet size={22} />} label="Взносы" dot={me.debts?.length ? '!' : undefined} />
              )}
              <Tab to="/sharpening" icon={<Scissors size={22} />} label="Заточка" dot={me.sharpeningDebt ? '!' : undefined} />
              <Tab to="/profile" icon={<User size={22} />} label="Профиль" />
            </>
          )}
        </div>
      </nav>

      {!inTelegram && !isRoot && (
        <button className="dev-back" onClick={goBack}>
          <ChevronLeft size={18} /> Назад
        </button>
      )}
      {(isStaff || !inTelegram) && (
        <div className="top-right">
          {isStaff && (
            <div className="mode-toggle" role="tablist" aria-label="Режим">
              <button className={staffMode ? '' : 'on'} onClick={() => !staffMode || switchTo('player')}>
                <User size={13} /> Игрок
              </button>
              <button className={staffMode ? 'on' : ''} onClick={() => staffMode || switchTo('staff')}>
                <ShieldCheck size={13} /> {staffLabel}
                {!staffMode && staffBadge ? <span className="dot">{staffBadge}</span> : null}
              </button>
            </div>
          )}
          {!inTelegram && (
            <button className="dev-pill" onClick={() => setDevOpen(true)}>
              <FlaskConical size={14} /> {me.user.first_name}
            </button>
          )}
        </div>
      )}
      <Sheet open={devOpen} onClose={() => setDevOpen(false)} title="Войти как…">
        <DevPicker embedded onPick={() => location.reload()} />
      </Sheet>

      {me.user.profile_complete === false && <Onboarding />}
      <Sheet open={debtOpen && me.user.profile_complete !== false} onClose={() => setDebtOpen(false)}>
        <div className="vstack center" style={{ alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--bad-soft)', color: 'var(--bad)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={30} />
          </div>
          <h2 style={{ fontSize: 22 }}>У вас долг {fmt.gel(debtTotal)}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {[
              ...(me.debts ?? []).map((d) => `Взнос за ${fmt.month(d.month).toLowerCase()} — ${fmt.gel(d.amount)}${d.status === 'rejected' ? ' (скрин отклонён)' : ''}`),
              ...(me.sharpeningDebt ? [`Заточка — ${fmt.gel(me.sharpeningDebt.total)}`] : []),
              ...(me.guestDebt ? [`Выходы на лёд (${me.guestDebt.count}) — ${fmt.gel(me.guestDebt.total)}`] : []),
            ].join(' · ')}
          </p>
          {me.user.signup_blocked && (
            <div className="alert bad" style={{ textAlign: 'left', width: '100%' }}>
              <div className="body">Запись на тренировки закрыта, пока долг не оплачен.</div>
            </div>
          )}
          <button
            className="btn block"
            onClick={() => {
              setDebtOpen(false);
              nav(duesDebt > 0 ? '/finance' : me.sharpeningDebt ? '/sharpening' : me.guestDebt ? `/events/${me.guestDebt.items[0].event_id}` : '/');
            }}
          >
            Оплатить
          </button>
          <button className="btn ghost block" onClick={() => setDebtOpen(false)}>
            Позже
          </button>
        </div>
      </Sheet>
      <Toaster />
    </MeCtx.Provider>
  );
}

function Tab({ to, icon, label, end, dot }: { to: string; icon: React.ReactNode; label: string; end?: boolean; dot?: number | string }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'on' : ''}`} replace>
      {icon}
      {label}
      {dot ? <span className="dot">{dot}</span> : null}
    </NavLink>
  );
}
