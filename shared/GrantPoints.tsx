import { useMemo, useState } from 'react';
import { api } from './api';
import { fmt } from './format';
import { pts, type ArcadeStats } from './arcadeStats';
import { Avatar, Nick, toast, toastErr } from './ui';

/**
 * Только владелец: начислить (или списать минусом) очки любому игроку команды.
 * Игроку приходит сообщение в бота, запись — в журнал ниже.
 */
export function GrantPoints({ data, onDone }: { data: Pick<ArcadeStats, 'members' | 'grants'>; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [userId, setUserId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.members.filter((m) => !s || String(m.user.name).toLowerCase().includes(s)).slice(0, s ? 30 : 8);
  }, [q, data.members]);
  const picked = data.members.find((m) => m.user.id === userId);
  const n = Number(amount.replace(',', '.'));

  const send = async () => {
    if (!picked || !n) return;
    setBusy(true);
    try {
      const r = await api.post<{ balance: number }>('/api/admin/arcade/grant', { userId: picked.user.id, points: n, note: note.trim() || undefined });
      toast(`${n > 0 ? 'Начислено' : 'Списано'} ${pts(Math.abs(n))} · теперь ${pts(r.balance)}`);
      setAmount('');
      setNote('');
      onDone();
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vstack" style={{ gap: 10 }}>
      <div className="card grant-card">
        <b>🎁 Начислить очки</b>
        <div className="muted small">Видишь только ты. Игроку придёт сообщение в бота. Минус — списать.</div>
        {picked ? (
          <div className="row" style={{ padding: 0 }}>
            <Avatar user={picked.user} size="sm" />
            <div className="grow">
              <div className="title">
                <Nick user={picked.user} text={picked.user.name} />
              </div>
              <div className="meta">на балансе {pts(picked.balance)}</div>
            </div>
            <button className="btn ghost sm" onClick={() => setUserId(null)}>
              Другой
            </button>
          </div>
        ) : (
          <>
            <input className="input" placeholder="Найти игрока" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="list">
              {list.map((m) => (
                <button key={m.user.id} className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setUserId(m.user.id)}>
                  <Avatar user={m.user} size="sm" />
                  <div className="grow">
                    <div className="title">
                      <Nick user={m.user} text={m.user.name} />
                    </div>
                  </div>
                  <span className="num muted small">{pts(m.balance)}</span>
                </button>
              ))}
              {!list.length && <div className="muted small">Никого не нашли</div>}
            </div>
          </>
        )}
        {picked && (
          <>
            <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
              {[10, 30, 50, 100].map((v) => (
                <button key={v} className={`btn sm ${n === v ? '' : 'secondary'}`} onClick={() => setAmount(String(v))}>
                  +{v}
                </button>
              ))}
            </div>
            <input className="input" inputMode="decimal" placeholder="Сколько очков (например 25 или -10)" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.-]/g, ''))} />
            <input className="input" maxLength={120} placeholder="За что (необязательно) — увидит игрок" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn block" disabled={busy || !n} onClick={send}>
              {n < 0 ? `Списать ${pts(-n)}` : n ? `Начислить ${pts(n)}` : 'Начислить'}
            </button>
          </>
        )}
      </div>
      {data.grants.length > 0 && (
        <>
          <div className="section-title">Журнал начислений</div>
          <div className="list">
            {data.grants.map((g, i) => (
              <div key={i} className="row">
                <Avatar user={g.user} size="sm" />
                <div className="grow">
                  <div className="title">{g.user.name}</div>
                  <div className="meta">
                    {fmt.dateShort(g.at)}
                    {g.note ? ` · ${g.note}` : ''}
                  </div>
                </div>
                <b className={`num ${g.points < 0 ? 'bad-text' : ''}`}>
                  {g.points > 0 ? '+' : '−'}
                  {pts(Math.abs(g.points))}
                </b>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
