import { language, saveLanguage, t } from '@shared/i18n';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, ChevronRight, Coins, Flame, Landmark, Receipt, Scissors, Shield, Trophy, Users } from 'lucide-react';
import { api, setDevUser } from '@shared/api';
import { haptic, inTelegram } from '@shared/tg';
import { PhotoEdit } from '@shared/PhotoEdit';
import { birthday, fmt, plural, POS_LABEL, ROLE_LABEL } from '@shared/format';
import { Nick, Avatar, can, Segmented, Sheet, SquadChip, useAction, useApi, useMe } from '@shared/ui';

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
      <div className={`card center vstack ${u.cover_url ? 'has-cover' : ''}`} style={{ alignItems: 'center', gap: 10, paddingTop: u.cover_url ? 0 : 22 }}>
        {u.cover_url && <div className="profile-cover" style={{ backgroundImage: `url(${u.cover_url})` }} />}
        <Avatar user={u} size="lg" />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}><Nick user={u} text={u.name} /></h1>
          <div className="muted small">
            {u.number != null ? `#${u.number}` : t('без номера')} · {u.position ? POS_LABEL[u.position] : t('позиция не указана')}
            {u.birth_date ? ` · 🎂 ${birthday(u.birth_date)}` : ''}
          </div>
        </div>
        {!!u.squads?.length && (
          <div className="chips" style={{ justifyContent: 'center' }}>
            {(me.squads ?? []).filter((s) => u.squads!.includes(s.id)).map((s) => (
              <SquadChip key={s.id} squad={s} full />
            ))}
          </div>
        )}
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
          {t('Изменить профиль')}
        </button>
      </div>

      <div className="section-title">{t('Статистика')}</div>
      <div className="card hstack" style={{ gap: 16 }}>
        <div className="ring" style={{ ['--p' as string]: s?.attendanceRate30 ?? 0 }}>
          <div>{s?.attendanceRate30 != null ? `${s.attendanceRate30}%` : '–'}</div>
        </div>
        <div>
          <b>{t('Посещаемость за 30 дней')}</b>
          <div className="muted small">
            {s?.streak ? t('Серия: {0} {1} подряд 🔥', s.streak, plural(s.streak, t('тренировка'), t('тренировки'), t('тренировок'))) : t('Начни серию на ближайшей тренировке')}
          </div>
        </div>
      </div>
      <div className="stat-grid">
        <Stat icon={<CalendarCheck size={14} />} v={s?.trainingsTotal} sub={s ? t('+{0} в мес.', s.trainingsMonth) : ''} l={t('Тренировок')} />
        <Stat icon={<Trophy size={14} />} v={s?.gamesTotal} sub={s ? t('+{0} в мес.', s.gamesMonth) : ''} l={t('Игр')} />
        <Stat icon={<Flame size={14} />} v={s?.streak} l={t('Серия подряд')} />
        <Stat icon={<Coins size={14} />} v={s ? fmt.gel(s.paidTotal) : undefined} l={t('Взносов оплачено')} />
        <Stat icon={<Scissors size={14} />} v={s?.sharpenings} l={t('Заточек')} />
        <Stat icon={<Users size={14} />} v={s?.favouriteLine != null ? (s.favouriteLine === 0 ? t('ВРТ') : t('{0}-я', s.favouriteLine)) : '–'} l={t('Чаще всего в пятёрке')} />
      </div>
      {!!s?.byMonth.length && (
        <div className="card">
          <b className="small">{t('Тренировки и игры по месяцам')}</b>
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

      <div className="list">
        <MenuRow icon={<Trophy size={20} />} title={t('Магазин ачивок')} onClick={() => nav('/shop')} />
      </div>
      <MyPrizes />

      {can(me, 'admin', 'coach', 'service') && (
        <div className="list">
          <MenuRow icon={<Shield size={20} />} title={t('Перейти в управление')} count={(b.pendingUsers ?? 0) + (b.proofs ?? 0) + (b.sharpenings ?? 0)} onClick={() => nav('/manage')} />
        </div>
      )}

      <label className="field">
        <span>{t('Язык приложения')}</span>
        <select
          className="input"
          value={language}
          onChange={(event) => {
            const value = event.target.value === 'en' ? 'en' : 'ru';
            if (saveLanguage(value)) window.location.reload();
            else window.alert(t('Не удалось сохранить язык'));
          }}
        >
          <option value="ru" lang="ru">Русский</option>
          <option value="en" lang="en">English</option>
        </select>
      </label>

      {!inTelegram && (
        <button
          className="btn ghost block"
          onClick={() => {
            setDevUser(null);
            location.href = '/';
          }}
        >
          {t('Сменить тестового пользователя')}
        </button>
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

type Prize = { id: number; item: string; title: string; kind: string; price: number; option: string | null; status: string; created_at: string; expires_at: string | null; done_at: string | null };
const PRIZE_ICON: Record<string, string> = {
  'nick-grad': '🌈', 'frame-month': '🖼', 'frame-season': '🖼', 'frame-forever': '💎',
  'hockey-stick-150': '🏒', 'skate-sharpening': '⛸', 'hockey-tape': '🎗', 'nick-fire': '🔥', 'nick-color': '🎨', 'avatar-frame': '🏅', 'shout-out': '📣', 'nick-emoji': '😎', troll: '🧌',
};

/** Призы из магазина игры: что действует, что можно потратить, что ждёт выдачи. */
function MyPrizes() {
  const nav = useNavigate();
  const { data } = useApi<Prize[]>('/api/me/prizes');
  if (!data?.length) return null;
  const now = Date.now();
  const live = data.filter((p) =>
    p.status === 'awaiting' || (p.kind === 'cosmetic' || p.kind === 'troll' ? p.status === 'active' && p.expires_at && Date.parse(p.expires_at) > now : p.status === 'active' || p.status === 'new'),
  );
  const past = data.filter((p) => !live.includes(p)).slice(0, 6);
  const line = (p: Prize) => {
    if (p.status === 'awaiting') return t('ждёт проверки оплаты');
    if (p.kind === 'cosmetic') return p.expires_at?.startsWith('9999') ? t('навсегда') : t('до') + ' ' + fmt.dateShort(p.expires_at!);
    if (p.kind === 'troll') return p.status === 'active' && p.expires_at && Date.parse(p.expires_at) > Date.now() ? t('троллит до') + ' ' + fmt.dateShort(p.expires_at) : t('неделя прошла');
    if (p.kind === 'voucher') return p.status === 'active' ? t('можно потратить') : t('потрачен');
    if (p.kind === 'physical') return p.status === 'new' ? t('админ уже знает — ждёт выдачи') : t('выдан');
    return t('бот поздравил в чате');
  };
  const row = (p: Prize, dim: boolean) => (
    <div key={p.id} className="row" style={dim ? { opacity: 0.6 } : undefined}>
      <span style={{ fontSize: 22, width: 28, textAlign: 'center' }}>{PRIZE_ICON[p.item] ?? '🎁'}</span>
      <div className="grow">
        <div className="title">
          {p.title}
          {p.item === 'nick-color' && p.option ? <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: p.option, marginLeft: 8, verticalAlign: 'middle' }} /> : null}
          {p.item === 'nick-emoji' && p.option ? ` ${p.option}` : ''}
        </div>
        <div className="meta">{line(p)}</div>
      </div>
      {p.kind === 'voucher' && p.status === 'active' && (
        <button className="btn xs" onClick={() => nav('/sharpening')}>
          {t('Потратить')}
        </button>
      )}
    </div>
  );
  return (
    <>
      <div className="section-title">{t('Мои призы')}</div>
      <div className="list">
        {live.map((p) => row(p, false))}
        {past.map((p) => row(p, true))}
      </div>
    </>
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
  const [f, setF] = useState({ first_name: '', last_name: '', birth_date: '', number: '', position: 'F' as 'F' | 'D' | 'G' });
  const { busy, run } = useAction();
  useEffect(() => {
    if (open)
      setF({
        first_name: me.user.first_name,
        last_name: me.user.last_name ?? '',
        birth_date: me.user.birth_date ?? '',
        number: me.user.number != null ? String(me.user.number) : '',
        position: me.user.position ?? 'F',
      });
  }, [open, me.user]);
  return (
    <Sheet open={open} onClose={onClose} title={t('Профиль')}>
      <div className="form">
        <PhotoEdit user={me.user} endpoint="/api/me/photo" onChange={onSaved} />
        <div className="form-row">
          <label className="field">
            <span>{t('Имя')}</span>
            <input className="input" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} />
          </label>
          <label className="field">
            <span>{t('Фамилия')}</span>
            <input className="input" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>{t('Дата рождения')}</span>
          <input className="input" type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('Игровой номер')}</span>
          <input className="input" inputMode="numeric" maxLength={2} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value.replace(/\D/g, '') })} />
        </label>
        <div className="field">
          <span>{t('Позиция')}</span>
          <Segmented
            value={f.position}
            onChange={(v) => setF({ ...f, position: v })}
            options={[
              ['F', t('Нападающий')],
              ['D', t('Защитник')],
              ['G', t('Вратарь')],
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
            }, t('Сохранено'))
          }
        >
          {t('Сохранить')}
        </button>
      </div>
    </Sheet>
  );
}
