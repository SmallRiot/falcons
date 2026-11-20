import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { api, ApiError, getDevUser, getSession, setDevUser, setSession, type Me } from '@shared/api';
import { MeCtx, Spinner, Toaster } from '@shared/ui';
import Login from './Login';
import Shell from './Shell';
import Overview from './pages/Overview';
import Schedule from './pages/Schedule';
import LineupBoard from './pages/LineupBoard';
import Players from './pages/Players';
import { GameAttendance, TrainingStats } from './pages/Attendance';
import Finance from './pages/Finance';
import SharpeningQueue from './pages/Sharpening';
import Squads from './pages/Squads';
import Accounts from './pages/Accounts';

/** Консоль — только для админов и тренера. Вход через Telegram (или тестовый, если включён на сервере). */
export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [needLogin, setNeedLogin] = useState(!getSession() && !getDevUser());
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/api/me'));
      setErr(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setSession(null);
        setDevUser(null);
        setNeedLogin(true);
        return;
      }
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!needLogin) void refresh();
  }, [needLogin, refresh]);

  if (needLogin) return <Login onDone={() => setNeedLogin(false)} />;
  if (err) return <NoAccess text={err} />;
  if (!me) return <Spinner />;
  const staff = me.user.status === 'active' && me.user.roles.some((r) => r === 'admin' || r === 'coach');
  if (!staff)
    return <NoAccess text="Консоль — только для админов и тренера. Игроки пользуются мини-приложением в Telegram." />;
  const admin = me.user.roles.includes('admin');

  return (
    <MeCtx.Provider value={{ me, refresh }}>
      <Shell>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/schedule/:id/lineup" element={<LineupBoard />} />
          <Route path="/players" element={<Players />} />
          <Route path="/games" element={<GameAttendance />} />
          <Route path="/trainings" element={<TrainingStats />} />
          {admin && <Route path="/finance" element={<Finance />} />}
          <Route path="/sharpening" element={<SharpeningQueue />} />
          {admin && <Route path="/squads" element={<Squads />} />}
          {admin && <Route path="/accounts" element={<Accounts />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
      <Toaster />
    </MeCtx.Provider>
  );
}

function NoAccess({ text }: { text: string }) {
  return (
    <div className="gate">
      <div className="empty">
        <div className="ic">
          <ShieldX size={26} />
        </div>
      </div>
      <h1>Нет доступа</h1>
      <p>{text}</p>
      <button
        className="btn ghost"
        onClick={() => {
          setSession(null);
          setDevUser(null);
          location.href = import.meta.env.BASE_URL;
        }}
      >
        Войти другим аккаунтом
      </button>
    </div>
  );
}
