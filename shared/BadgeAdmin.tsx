import { useMemo, useState } from 'react';
import { api, type PublicUser } from './api';
import { BADGES } from './badges';
import { fmt } from './format';
import { ask, Avatar, Nick, Spinner, toast, toastErr, useApi } from './ui';

type BadgeRow = { id: number; user_id: number; badge: string; expires_at: string | null; at: string; user: PublicUser };
type BadgesData = { active: BadgeRow[]; members: PublicUser[] };

const TERMS: [string, number | null][] = [
  ['Неделя', 7],
  ['Месяц', 30],
  ['3 месяца', 90],
  ['Год', 365],
  ['Навсегда', null],
];

/**
 * Только владелец: значки у ника (БОСС, ВИНО, ПИВО…) — выдать на срок или навсегда, снять.
 * userId — сразу выбранный игрок (из карточки человека).
 */
export function BadgeAdmin({ userId, onChange }: { userId?: number; onChange?: () => void }) {
  const { data, reload } = useApi<BadgesData>('/api/admin/badges');
  const [q, setQ] = useState('');
  const [pickedId, setPickedId] = useState<number | null>(userId ?? null);
  const [badge, setBadge] = useState<string>('boss');
  const [term, setTerm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.members ?? []).filter((m) => !s || String(m.name).toLowerCase().includes(s)).slice(0, s ? 30 : 8);
  }, [q, data]);
  if (!data) return <Spinner />;
  const picked = data.members.find((m) => m.id === pickedId);
  const mine = data.active.filter((b) => !userId || b.user_id === userId);
  const b = BADGES[badge];

  const give = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await api.post('/api/admin/badges', { userId: picked.id, badge, days: term });
      toast(`${b.emoji} ${b.label} → ${picked.first_name}${term ? ` на ${TERMS.find((x) => x[1] === term)?.[0].toLowerCase()}` : ' навсегда'}`);
      await reload();
      onChange?.();
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (r: BadgeRow) => {
    if (!(await ask(`Снять значок «${BADGES[r.badge]?.label ?? r.badge}» у ${r.user.name}?`, { okText: 'Снять', danger: true }))) return;
    try {
      await api.del(`/api/admin/badges/${r.id}`);
      await reload();
      onChange?.();
    } catch (e) {
      toastErr(e);
    }
  };
  const preview = picked ? { ...picked, style: { ...(picked.style ?? {}), badges: [badge] } } : null;

  return (
    <div className="vstack" style={{ gap: 10 }}>
      <div className="card vstack" style={{ gap: 10 }}>
        <b>🏷 Выдать значок</b>
        <div className="muted small">Видишь только ты. Значок горит у ника везде: в составах, пятёрках, профиле.</div>
        {!userId &&
          (picked ? (
            <div className="row" style={{ padding: 0 }}>
              <Avatar user={picked} size="sm" />
              <div className="grow">
                <div className="title">
                  <Nick user={picked} text={picked.name} />
                </div>
              </div>
              <button className="btn ghost sm" onClick={() => setPickedId(null)}>
                Другой
              </button>
            </div>
          ) : (
            <>
              <input className="input" placeholder="Найти игрока" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="list">
                {list.map((m) => (
                  <button key={m.id} className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setPickedId(m.id)}>
                    <Avatar user={m} size="sm" />
                    <div className="grow">
                      <div className="title">
                        <Nick user={m} text={m.name} />
                      </div>
                    </div>
                  </button>
                ))}
                {!list.length && <div className="muted small">Никого не нашли</div>}
              </div>
            </>
          ))}

        <div className="badge-grid">
          {Object.entries(BADGES).map(([k, v]) => (
            <button key={k} className={`badge-opt ${badge === k ? 'on' : ''}`} onClick={() => setBadge(k)} title={v.hint}>
              <span className="u-badge" style={{ background: v.bg, color: v.fg, WebkitTextFillColor: v.fg, margin: 0 }}>
                {v.emoji} {v.label}
              </span>
            </button>
          ))}
        </div>
        <div className="muted small">{b.hint}</div>

        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {TERMS.map(([label, d]) => (
            <button key={label} className={`chip ${term === d ? 'info' : ''}`} style={{ border: 0, height: 32, padding: '0 12px' }} onClick={() => setTerm(d)}>
              {label}
            </button>
          ))}
        </div>

        {preview && (
          <div className="row" style={{ padding: '8px 0 0' }}>
            <Avatar user={preview} size="sm" />
            <div className="grow title">
              <Nick user={preview} text={preview.name} />
            </div>
          </div>
        )}
        <button className="btn block" disabled={busy || !picked} onClick={give}>
          {b.emoji} Выдать «{b.label}» {term ? `на ${TERMS.find((x) => x[1] === term)?.[0].toLowerCase()}` : 'навсегда'}
        </button>
      </div>

      <div className="section-title">{userId ? 'Значки' : `Выданные значки · ${mine.length}`}</div>
      {mine.length ? (
        <div className="list">
          {mine.map((r) => {
            const v = BADGES[r.badge];
            return (
              <div key={r.id} className="row">
                {!userId && <Avatar user={r.user} size="sm" />}
                <div className="grow">
                  <div className="title">
                    {!userId && <>{r.user.name} </>}
                    {v ? (
                      <span className="u-badge" style={{ background: v.bg, color: v.fg, WebkitTextFillColor: v.fg }}>
                        {v.emoji} {v.label}
                      </span>
                    ) : (
                      r.badge
                    )}
                  </div>
                  <div className="meta">{r.expires_at ? `до ${fmt.dateShort(r.expires_at)}` : 'навсегда'} · выдан {fmt.dateShort(r.at)}</div>
                </div>
                <button className="btn ghost sm" onClick={() => remove(r)}>
                  Снять
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="muted small">Пока ни одного</div>
      )}
    </div>
  );
}
