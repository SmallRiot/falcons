import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, ChevronRight, Coins, Flame, Landmark, Receipt, Scissors, Trophy, Users } from 'lucide-react';
import { api } from '../api';
import { fmt, plural, POS_LABEL, ROLE_LABEL } from '../format';
import { Avatar, can, Segmented, Sheet, useAction, useApi, useMe } from '../ui';

interface Stats {
  trainingsTotal: number;
  trainingsMonth: number;
  gamesTotal: number;
  gamesMonth: number;
  attendanceRate30: number | null;
  streak: number;
  paidTotal: number;
  sharpenings: number;
  favouriteLine: number | null;
  byMonth: { m: string; c: number }[];
}

export default function Profile() {
  const { me, refresh } = useMe();
  const nav = useNavigate();
  const { data: s } = useApi<Stats>('/api/me/stats');
  const [edit, setEdit] = useState(false);
  const u = me.user;
  const b = me.badges ?? {};
  const max = Math.max(1, ...(s?.byMonth ?? []).map((x) => x.c));
  const curMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="page">
      <div className="card center vstack" style={{ alignItems: 'center', gap: 10, paddingTop: 22 }}>
        <Avatar user={u} size="lg" />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>{u.name}</h1>
          <div className="muted small">
            {u.number != null ? `#${u.number}` : 'без номера'} · {u.position ? POS_LABEL[u.position] : 'позиция не указана'}
          </div>
        </div>
        {u.roles.length > 0 && (
          <div className="chips" style={{ justifyContent: 'center' }}>
            {u.roles.map((r) => (
              <span key={r} className="chip info">
                {ROLE_LABEL[r]}
              </span>
            ))}
          </div>
        )}
        <button className="btn ghost sm" onClick={() => setEdit(true)}>
          Изменить номер и позицию
        </button>
      </div>

      <div className="section-title">Статистика</div>
      <div className="card hstack" style={{ gap: 16 }}>
        <div className="ring" style={{ ['--p' as string]: s?.attendanceRate30 ?? 0 }}>
          <div>{s?.attendanceRate30 != null ? `${s.attendanceRate30}%` : '–'}</div>
        </div>
        <div>
          <b>Посещаемость за 30 дней</b>
          <div className="muted small">
            {s?.streak ? `Серия: ${s.streak} ${plural(s.streak, 'тренировка', 'тренировки', 'тренировок')} подряд 🔥` : 'Начни серию на ближайшей тренировке'}
          </div>
        </div>
      </div>
      <div className="stat-grid">
        <Stat icon={<CalendarCheck size={14} />} v={s?.trainingsTotal} sub={s ? `+${s.trainingsMonth} в мес.` : ''} l="Тренировок" />
        <Stat icon={<Trophy size={14} />} v={s?.gamesTotal} sub={s ? `+${s.gamesMonth} в мес.` : ''} l="Игр" />
        <Stat icon={<Flame size={14} />} v={s?.streak} l="Серия подряд" />
        <Stat icon={<Coins size={14} />} v={s ? fmt.gel(s.paidTotal) : undefined} l="Взносов оплачено" />
        <Stat icon={<Scissors size={14} />} v={s?.sharpenings} l="Заточек" />
        <Stat icon={<Users size={14} />} v={s?.favouriteLine != null ? (s.favouriteLine === 0 ? 'ВРТ' : `${s.favouriteLine}-я`) : '–'} l="Чаще всего в пятёрке" />
      </div>
      {!!s?.byMonth.length && (
        <div className="card">
          <b className="small">Тренировки и игры по месяцам</b>
          <div className="bars">
            {s.byMonth.map((x) => (
              <div key={x.m} className={`b ${x.m === curMonth ? 'cur' : ''}`}>
                <div className="col" style={{ height: `${(x.c / max) * 100}%` }}>
                  <span>{x.c}</span>
                </div>
                <div className="x">{fmt.monthShort(x.m)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {can(me, 'admin', 'service') && (
        <>
          <div className="section-title">Управление</div>
          <div className="list">
            {can(me, 'admin') && (
              <>
                <MenuRow icon={<Users size={20} />} title="Люди и роли" count={b.pendingUsers} onClick={() => nav('/admin/users')} />
                <MenuRow icon={<Receipt size={20} />} title="Взносы и проверка оплат" count={b.proofs} onClick={() => nav('/admin/finance')} />
                <MenuRow icon={<Landmark size={20} />} title="Счета для оплаты" onClick={() => nav('/admin/accounts')} />
              </>
            )}
            {can(me, 'service', 'admin') && (
              <MenuRow icon={<Scissors size={20} />} title="Очередь заточки" count={b.sharpenings} onClick={() => nav('/service')} />
            )}
          </div>
        </>
      )}

      <EditSheet open={edit} onClose={() => setEdit(false)} onSaved={refresh} />
    </div>
  );
}

function Stat({ icon, v, l, sub }: { icon: React.ReactNode; v: React.ReactNode; l: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="v">
        {v ?? '–'}
        {sub && <small>{sub}</small>}
      </div>
      <div className="l">
        {icon}
        {l}
      </div>
    </div>
  );
}

function MenuRow({ icon, title, count, onClick }: { icon: React.ReactNode; title: string; count?: number; onClick: () => void }) {
  return (
    <button className="row" onClick={onClick}>
      <span style={{ color: 'var(--falcon)' }}>{icon}</span>
      <div className="grow">
        <div className="title">{title}</div>
      </div>
      {count ? <span className="chip bad">{count}</span> : null}
      <ChevronRight size={18} className="chev" />
    </button>
  );
}

function EditSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const { me } = useMe();
  const [f, setF] = useState({ first_name: '', last_name: '', number: '', position: 'F' as 'F' | 'D' | 'G' });
  const { busy, run } = useAction();
  useEffect(() => {
    if (open)
      setF({
        first_name: me.user.first_name,
        last_name: me.user.last_name ?? '',
        number: me.user.number != null ? String(me.user.number) : '',
        position: me.user.position ?? 'F',
      });
  }, [open, me.user]);
  return (
    <Sheet open={open} onClose={onClose} title="Профиль">
      <div className="form">
        <div className="form-row">
          <label className="field">
            <span>Имя</span>
            <input className="input" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} />
          </label>
          <label className="field">
            <span>Фамилия</span>
            <input className="input" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>Игровой номер</span>
          <input className="input" inputMode="numeric" maxLength={2} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value.replace(/\D/g, '') })} />
        </label>
        <div className="field">
          <span>Позиция</span>
          <Segmented
            value={f.position}
            onChange={(v) => setF({ ...f, position: v })}
            options={[
              ['F', 'Нападающий'],
              ['D', 'Защитник'],
              ['G', 'Вратарь'],
            ]}
          />
        </div>
        <button
          className="btn block"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api.patch('/api/me', { ...f, number: f.number === '' ? null : Number(f.number) });
              await onSaved();
              onClose();
            }, 'Сохранено')
          }
        >
          Сохранить
        </button>
      </div>
    </Sheet>
  );
}
