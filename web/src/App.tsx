import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Home as HomeIcon, Scissors, User, Wallet, AlertTriangle, FlaskConical } from 'lucide-react';
import { api, ApiError, getDevUser, type Me } from './api';
import { inTelegram, startParam, tg } from './tg';
import { MeCtx, Sheet, Spinner, Toaster } from './ui';
import { fmt } from './format';
import { startRoute } from './nav';
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

const ROOTS = ['/', '/events', '/finance', '/sharpening', '/profile'];


export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<{ status: number; message: string } | null>(null);
  const [needDev, setNeedDev] = useState(!inTelegram && !getDevUser());
  const [debtOpen, setDebtOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();

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
  const hasDebt = !!me?.debts?.length || !!me?.sharpeningDebt;
  useEffect(() => {
    if (hasDebt) setDebtOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.user.id, hasDebt]);

  // системная кнопка «Назад» в Telegram
  useEffect(() => {
    if (!tg) return;
    const isRoot = ROOTS.includes(loc.pathname);
    const back = () => nav(-1);
    if (isRoot) tg.BackButton.hide();
    else {
      tg.BackButton.show();
      tg.BackButton.onClick(back);
    }
    return () => tg!.BackButton.offClick(back);
  }, [loc.pathname, nav]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  if (needDev) return <DevPicker onPick={() => setNeedDev(false)} />;
  if (err) return <Gate kind="error" message={err.message} onRetry={refresh} onDev={() => setDevOpen(true)} devOpen={devOpen} setDevOpen={setDevOpen} />;
  if (!me) return <Spinner />;
  if (me.user.status !== 'active')
    return <Gate kind={me.user.status} me={me} onRetry={refresh} onDev={() => setDevOpen(true)} devOpen={devOpen} setDevOpen={setDevOpen} />;

  const duesDebt = (me.debts ?? []).reduce((s, d) => s + d.amount, 0);
  const debtTotal = duesDebt + (me.sharpeningDebt?.total ?? 0);
  const staffBadge = (me.badges?.pendingUsers ?? 0) + (me.badges?.proofs ?? 0) + (me.badges?.sharpenings ?? 0);

  return (
    <MeCtx.Provider value={{ me, refresh }}>
      <div className={`app ${inTelegram ? '' : 'dev'}`}>
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
          <Route path="/notifications" element={<Notifications />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </div>

      <nav className="tabbar">
        <div className="tabbar-inner">
          <Tab to="/" icon={<HomeIcon size={22} />} label="Главная" end />
          <Tab to="/events" icon={<CalendarDays size={22} />} label="События" />
          <Tab to="/finance" icon={<Wallet size={22} />} label="Взносы" dot={me.debts?.length ? '!' : undefined} />
          <Tab to="/sharpening" icon={<Scissors size={22} />} label="Заточка" dot={me.sharpeningDebt ? '!' : undefined} />
          <Tab to="/profile" icon={<User size={22} />} label="Профиль" dot={staffBadge || undefined} />
        </div>
      </nav>

      {!inTelegram && (
        <button className="dev-pill" onClick={() => setDevOpen(true)}>
          <FlaskConical size={14} /> {me.user.first_name}
        </button>
      )}
      <Sheet open={devOpen} onClose={() => setDevOpen(false)} title="Войти как…">
        <DevPicker embedded onPick={() => location.reload()} />
      </Sheet>

      <Sheet open={debtOpen} onClose={() => setDebtOpen(false)}>
        <div className="vstack center" style={{ alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--bad-soft)', color: 'var(--bad)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={30} />
          </div>
          <h2 style={{ fontSize: 22 }}>У вас долг {fmt.gel(debtTotal)}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {[
              ...(me.debts ?? []).map((d) => `Взнос за ${fmt.month(d.month).toLowerCase()} — ${fmt.gel(d.amount)}${d.status === 'rejected' ? ' (скрин отклонён)' : ''}`),
              ...(me.sharpeningDebt ? [`Заточка — ${fmt.gel(me.sharpeningDebt.total)}`] : []),
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
              nav(duesDebt > 0 ? '/finance' : '/sharpening');
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
