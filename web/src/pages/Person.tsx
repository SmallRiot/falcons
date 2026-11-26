import { t } from '@shared/i18n';
import { useParams, useNavigate } from 'react-router-dom';
import { api, type PublicUser } from '@shared/api';
import { fmt, POS_SHORT, ROLE_LABEL } from '@shared/format';
import { askText, Avatar, Nick, Spinner, useAction, useApi, useMe, UserTags } from '@shared/ui';
import { BadgeAdmin } from '@shared/BadgeAdmin';

type Ev = { id: number; type: string; title: string | null; starts_at: string; location: string | null; status: string; attended: number | null; line: number | null; score_us: number | null; score_them: number | null };
type Stat = { trainings: number; games: number; ofTrainings: number };
type PersonData = {
  user: PublicUser & { club: string | null };
  roles: string[];
  noTelegram: boolean;
  since: string;
  stats: { d30: Stat; d90: Stat; all: Stat };
  balance: number;
  arcadeGoals: number;
  lastPlayed: string | null;
  achievements: { item: string; title: string; expires_at: string | null }[];
  upcoming: Ev[];
  history: Ev[];
};

const pts = (n: number) => (Math.round(n * 10) / 10).toLocaleString('ru-RU');
const pct = (s: Stat) => (s.ofTrainings ? `${Math.round((s.trainings / s.ofTrainings) * 100)}%` : '—');

/** Карточка человека: кто он, откуда, как часто на льду, очки и ачивки, история тренировок и игр. */
export default function Person() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, loading, reload } = useApi<PersonData>(`/api/people/${id}`, [id]);
  const { run } = useAction();
  const { me } = useMe();
  if (loading || !data) return <Spinner />;
  const u = data.user;
  const guest = !!u.tags?.some((x) => x.guest);

  const editClub = async () => {
    const v = await askText(t('Из какой команды {0}? Пусто — просто «Гость».', u.first_name), u.club ?? '', t('Например: Барсы'));
    if (v === null) return;
    run(async () => {
      await api.patch(`/api/people/${u.id}/club`, { club: v });
      await reload();
    }, t('Сохранено'));
  };

  const evRow = (e: Ev, future: boolean) => {
    const was = e.attended != null ? e.attended === 1 : e.status === 'in';
    const mark = future ? (e.status === 'in' ? ['идёт', 'ok'] : ['не идёт', '']) : was ? ['был', 'ok'] : e.status === 'out' ? ['не пошёл', ''] : ['не пришёл', 'bad'];
    return (
      <button key={e.id} className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav(`/events/${e.id}`)}>
        <span style={{ fontSize: 20, width: 26, textAlign: 'center' }}>{e.type === 'game' ? '🥅' : '🏒'}</span>
        <div className="grow">
          <div className="title">{e.title || (e.type === 'game' ? t('Игра') : t('Тренировка'))}</div>
          <div className="meta">
            {fmt.day(e.starts_at)}, {fmt.time(e.starts_at)}
            {e.line ? ` · ${e.line}-${t('я пятёрка')}` : ''}
            {e.type === 'game' && e.score_us != null ? ` · ${e.score_us}:${e.score_them}` : ''}
          </div>
        </div>
        <span className={`chip ${mark[1]}`}>{t(mark[0])}</span>
      </button>
    );
  };

  return (
    <div className="page">
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 20, textAlign: 'center' }}>
        <Avatar user={u} size="lg" />
        <div style={{ fontSize: 20, fontWeight: 800 }}>
          <Nick user={u} text={u.name} />
        </div>
        <UserTags user={u} />
        <div className="muted small">
          {u.position ? POS_SHORT[u.position] : t('позиция не указана')}
          {u.number != null ? ` · #${u.number}` : ''}
          {u.username ? ` · @${u.username}` : ''}
          {data.roles.filter((r) => r !== 'guest').length ? ` · ${data.roles.filter((r) => r !== 'guest').map((r) => ROLE_LABEL[r] ?? r).join(', ')}` : ''}
        </div>
        <div className="muted small">
          {data.noTelegram ? t('Гость без Telegram — записывает тренер') : `${t('В приложении с')} ${fmt.dateShort(data.since)}`}
        </div>
        {guest && (
          <button className="btn ghost sm" onClick={editClub}>
            {u.club ? `${t('Команда')}: ${u.club} ✏️` : t('Указать команду гостя')}
          </button>
        )}
      </div>

      <div className="section-title">{t('На льду')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
        {(
          [
            [t('30 дней'), data.stats.d30],
            [t('90 дней'), data.stats.d90],
            [t('Всего'), data.stats.all],
          ] as const
        ).map(([label, s]) => (
          <div key={label} className="card tight" style={{ padding: '10px 12px' }}>
            <div className="muted small">{label}</div>
            <div style={{ fontWeight: 800, fontSize: 18 }} className="num">
              🏒 {s.trainings}
            </div>
            <div className="muted small">
              🥅 {s.games} · {pct(s)}
            </div>
          </div>
        ))}
      </div>
      <div className="muted small">{t('🏒 тренировки · 🥅 игры · % — от всех тренировок за период')}</div>

      <div className="section-title">{t('Бонусы')}</div>
      <div className="card tight">
        <div className="kv">
          <span>⭐ {t('Очки в игре')}</span>
          <b className="num">{pts(data.balance)}</b>
        </div>
        <div className="kv">
          <span>🥅 {t('Голов в «Ледовом дропе»')}</span>
          <span className="num">{data.arcadeGoals}</span>
        </div>
        {data.lastPlayed && (
          <div className="kv">
            <span>{t('Последний раз играл')}</span>
            <span>{fmt.dateShort(data.lastPlayed)}</span>
          </div>
        )}
        {data.achievements.length ? (
          data.achievements.map((a, i) => (
            <div key={i} className="kv">
              <span>🏅 {a.title}</span>
              <span className="muted small">{a.expires_at?.startsWith('9999') ? t('навсегда') : a.expires_at ? `${t('до')} ${fmt.dateShort(a.expires_at)}` : ''}</span>
            </div>
          ))
        ) : (
          <div className="muted small" style={{ marginTop: 6 }}>{t('Активных ачивок нет')}</div>
        )}
      </div>

      {me.user.owner && !data.noTelegram && (
        <>
          <div className="section-title">{t('Значки у ника')}</div>
          <BadgeAdmin userId={u.id} onChange={reload} />
        </>
      )}

      {data.upcoming.length > 0 && (
        <>
          <div className="section-title">{t('Ближайшие')}</div>
          <div className="list">{data.upcoming.map((e) => evRow(e, true))}</div>
        </>
      )}

      <div className="section-title">{t('Тренировки и игры')}</div>
      {data.history.length ? <div className="list">{data.history.map((e) => evRow(e, false))}</div> : <div className="muted small">{t('Пока ни одной записи')}</div>}
    </div>
  );
}
