import { t } from '@shared/i18n';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Search, ShieldCheck, Users } from 'lucide-react';
import type { PublicUser } from '@shared/api';
import { fmt, POS_SHORT } from '@shared/format';
import { Avatar, can, Empty, Jersey, Nick, Segmented, Spinner, useApi, useMe, UserTags } from '@shared/ui';

export type PersonRow = {
  user: PublicUser;
  roles: string[];
  noTelegram: boolean;
  balance: number;
  achievements: number;
  trainings30: number;
  games30: number;
  total: number;
  lastOnIce: string | null;
};
type PeopleData = { trainings30: number; people: PersonRow[] };
type Sort = 'name' | 'ice' | 'points';

const pts = (n: number) => (Math.round(n * 10) / 10).toLocaleString('ru-RU');

/** Все, кто ходит на лёд: составы, гости из других команд, очки, ачивки и посещаемость. Тап — карточка человека. */
export default function People() {
  const { me } = useMe();
  const nav = useNavigate();
  const { data, loading } = useApi<PeopleData>('/api/people');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('name');

  const squads = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of data?.people ?? []) for (const tg of p.user.tags ?? []) if (!tg.guest) m.set(tg.label, tg.color);
    return [...m.entries()];
  }, [data]);

  if (loading || !data) return <Spinner />;
  const s = q.trim().toLowerCase();
  const isGuest = (p: PersonRow) => !!p.user.tags?.some((x) => x.guest);
  const list = data.people
    .filter((p) =>
      group === 'all' ? true : group === 'guests' ? isGuest(p) : group === 'none' ? !p.user.tags?.length : !!p.user.tags?.some((x) => !x.guest && x.label === group),
    )
    .filter((p) => !s || `${p.user.name} ${p.user.username ?? ''} ${p.user.number ?? ''} ${(p.user.tags ?? []).map((x) => x.label).join(' ')}`.toLowerCase().includes(s))
    .sort((a, b) =>
      sort === 'ice' ? b.trainings30 + b.games30 - (a.trainings30 + a.games30) : sort === 'points' ? b.balance - a.balance : String(a.user.name).localeCompare(String(b.user.name), 'ru'),
    );
  const noneCount = data.people.filter((p) => !p.user.tags?.length).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('Люди')}</h1>
          <div className="sub">
            {data.people.length} {t('чел.')} · {t('тренировок за 30 дней:')} {data.trainings30}
          </div>
        </div>
        {can(me, 'admin') && (
          <button className="btn secondary sm" onClick={() => nav('/admin/users')}>
            <ShieldCheck size={16} /> {t('Роли')}
            {me.badges?.pendingUsers ? <span className="chip warn" style={{ marginLeft: 4 }}>{me.badges.pendingUsers}</span> : null}
          </button>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <Search size={17} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--muted)' }} />
        <input className="input" style={{ paddingLeft: 40 }} placeholder={t('Имя, ник, номер или команда')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="chips" style={{ flexWrap: 'wrap' }}>
        {[
          ['all', `${t('Все')} · ${data.people.length}`, null],
          ...squads.map(([label, color]) => [label, label, color]),
          ['guests', `${t('Гости')} · ${data.people.filter(isGuest).length}`, '#8a63d2'],
          ...(noneCount ? [['none', `${t('Без состава')} · ${noneCount}`, null]] : []),
        ].map(([key, label, color]) => (
          <button
            key={key!}
            className={`chip ${group === key ? 'info' : ''}`}
            style={{ border: 0, height: 32, padding: '0 12px', ...(group !== key && color ? { background: `${color}22`, color: color! } : {}) }}
            onClick={() => setGroup(key!)}
          >
            {label}
          </button>
        ))}
      </div>

      <Segmented
        value={sort}
        onChange={setSort}
        options={[
          ['name', t('По имени')],
          ['ice', t('Чаще на льду')],
          ['points', t('По очкам')],
        ]}
      />

      {list.length ? (
        <div className="list">
          {list.map((p) => (
            <button key={p.user.id} className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav(`/people/${p.user.id}`)}>
              <Avatar user={p.user} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <Nick user={p.user} text={p.user.name} />
                  <UserTags user={p.user} />
                </div>
                <div className="meta" style={{ whiteSpace: 'normal' }}>
                  {p.user.position ? POS_SHORT[p.user.position] : '—'} · 🏒 {p.trainings30}
                  {p.games30 ? ` · 🥅 ${p.games30}` : ''}
                  {p.balance ? ` · ⭐ ${pts(p.balance)}` : ''}
                  {p.achievements ? ` · 🏅 ${p.achievements}` : ''}
                  {p.lastOnIce ? ` · ${t('был')} ${fmt.dateShort(p.lastOnIce)}` : ''}
                </div>
              </div>
              <Jersey n={p.user.number} />
              <ChevronRight size={16} className="muted" />
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={<Users size={26} />} title={t('Никого не нашли')} />
      )}
      <div className="muted small">{t('За 30 дней: 🏒 тренировки · 🥅 игры. ⭐ очки в игре · 🏅 активные ачивки')}</div>
    </div>
  );
}
