import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eraser, Send, Sparkles } from 'lucide-react';
import { api, type EventDetail, type LineupItem, type PublicUser, type Team } from '@shared/api';
import { haptic } from '@shared/tg';
import { Segmented, Spinner, toast, toastErr, useApi } from '@shared/ui';
import { fmt, POS_SHORT } from '@shared/format';
import Lines, { TEAM_LABEL } from './Lines';
import { autoFill, autoFillSplit } from '@shared/lineup';

type Sel = { kind: 'pool'; userId: number } | { kind: 'slot'; team: Team; line: number; slot: string } | null;

export default function LineupEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: ev, loading } = useApi<EventDetail>(`/api/events/${id}`, [id]);
  const [lineup, setLineup] = useState<LineupItem[]>([]);
  const [lines, setLines] = useState<'3' | '4'>('3');
  const [sel, setSel] = useState<Sel>(null);
  const [filter, setFilter] = useState<'all' | 'F' | 'D' | 'G'>('all');
  const [split, setSplit] = useState(true);
  const [team, setTeam] = useState<'dark' | 'light'>('dark');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ev) return;
    const going = new Set(ev.players.map((p) => p.id));
    setLineup(ev.lineup.filter((i) => going.has(i.user_id)));
    if (ev.lineup.some((l) => l.line === 4)) setLines('4');
    // на тренировках по умолчанию делимся на тёмных и светлых, на играх — одна команда
    setSplit(ev.lineup.length ? ev.lineup.some((l) => l.team !== '') : ev.type === 'training');
  }, [ev]);

  const players = useMemo(() => new Map<number, PublicUser>((ev?.players ?? []).map((p) => [p.id, p])), [ev]);
  if (loading || !ev) return <Spinner />;

  const nLines = Number(lines);
  const cur: Team = split ? team : '';
  const teamCount = (t: Team) => lineup.filter((i) => i.team === t).length;
  const placed = new Set(lineup.map((i) => i.user_id));
  const pool = ev.players.filter((p) => !placed.has(p.id) && (filter === 'all' || (p.position ?? 'F') === filter));
  const unplacedCount = ev.players.filter((p) => !placed.has(p.id)).length;

  const onPool = (userId: number) => {
    haptic.select();
    setSel((s) => (s?.kind === 'pool' && s.userId === userId ? null : { kind: 'pool', userId }));
  };

  const onSlot = (line: number, slot: string) => {
    haptic.select();
    const same = (i: LineupItem, t: Team, l: number, s: string) => i.team === t && i.line === l && i.slot === s;
    const here = lineup.find((i) => same(i, cur, line, slot));
    if (sel?.kind === 'pool') {
      // ставим игрока из пула; если место занято — вытесняем в пул
      setLineup((l) => [...l.filter((i) => !same(i, cur, line, slot)), { user_id: sel.userId, team: cur, line, slot }]);
      setSel(null);
      return;
    }
    if (sel?.kind === 'slot') {
      if (same({ ...sel, user_id: 0 }, cur, line, slot)) {
        // второй тап по выбранному — убрать в пул
        setLineup((l) => l.filter((i) => !same(i, cur, line, slot)));
        setSel(null);
        return;
      }
      // меняем местами (можно и между командами: выбрал у тёмных, переключил вкладку, тапнул у светлых)
      setLineup((l) => {
        const a = l.find((i) => same(i, sel.team, sel.line, sel.slot));
        const b = l.find((i) => same(i, cur, line, slot));
        const rest = l.filter((i) => i !== a && i !== b);
        if (a) rest.push({ ...a, team: cur, line, slot });
        if (b) rest.push({ ...b, team: sel.team, line: sel.line, slot: sel.slot });
        return rest;
      });
      setSel(null);
      return;
    }
    if (here) setSel({ kind: 'slot', team: cur, line, slot });
  };

  const save = async (publish: boolean) => {
    setBusy(true);
    try {
      const r = await api.put<{ notified: number }>(`/api/events/${ev.id}/lineup`, {
        items: lineup.filter((i) => i.line <= nLines),
        publish,
      });
      toast(publish ? `Опубликовано · бот написал ${r.notified} игрокам` : 'Черновик сохранён');
      nav(`/events/${ev.id}`, { replace: true });
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  };

  const changeSplit = (v: boolean) => {
    if (v === split) return;
    if (lineup.length && !confirm('Сбросить текущую расстановку?')) return;
    setLineup([]);
    setSplit(v);
  };

  const selectedSlot = sel?.kind === 'slot' && sel.team === cur ? { line: sel.line, slot: sel.slot } : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Пятёрки</h1>
          <div className="sub">
            {ev.type === 'game' ? 'Игра' : 'Тренировка'} · {fmt.day(ev.starts_at)}, {fmt.time(ev.starts_at)}
          </div>
        </div>
      </div>

      <div className="hstack">
        <div style={{ flex: 1 }}>
          <Segmented
            value={lines}
            onChange={(v) => {
              setLines(v);
              if (v === '3') setLineup((l) => l.filter((i) => i.line <= 3));
            }}
            options={[
              ['3', '3 звена'],
              ['4', '4 звена'],
            ]}
          />
        </div>
        <button className="btn secondary sm" onClick={() => setLineup(split ? autoFillSplit(ev.players, nLines) : autoFill(ev.players, nLines))}>
          <Sparkles size={16} /> Авто
        </button>
        <button className="icon-btn" onClick={() => setLineup([])} aria-label="Очистить">
          <Eraser size={18} />
        </button>
      </div>

      <Segmented
        value={split ? 'split' : 'one'}
        onChange={(v) => changeSplit(v === 'split')}
        options={[
          ['split', 'Тёмные / Светлые'],
          ['one', 'Одна команда'],
        ]}
      />

      <div className="card tight">
        <div className="between" style={{ marginBottom: 10 }}>
          <b className="small">
            Без места · {unplacedCount} из {ev.players.length}
          </b>
          <div className="chips">
            {(['all', 'F', 'D', 'G'] as const).map((f) => (
              <button
                key={f}
                className={`chip ${filter === f ? 'info' : ''}`}
                style={{ border: 0 }}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'Все' : POS_SHORT[f]}
              </button>
            ))}
          </div>
        </div>
        {pool.length ? (
          <div className="pool">
            {pool.map((p) => (
              <button
                key={p.id}
                className={`pchip ${sel?.kind === 'pool' && sel.userId === p.id ? 'sel' : ''}`}
                onClick={() => onPool(p.id)}
              >
                <span className="jersey">{p.number ?? '–'}</span>
                {p.first_name} {p.last_name?.[0] ? `${p.last_name[0]}.` : ''}
                <span className="p">{p.position ? POS_SHORT[p.position] : ''}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="muted small">{ev.players.length ? 'Все расставлены 👌' : 'Никто ещё не записался'}</div>
        )}
        <div className="muted small" style={{ marginTop: 10 }}>
          {sel?.kind === 'pool'
            ? 'Тапни на место в пятёрке'
            : sel?.kind === 'slot'
              ? 'Тапни другое место, чтобы поменять, или это же — чтобы убрать'
              : 'Тапни игрока, потом место. Тап по игроку в пятёрке — поменять местами.'}
        </div>
      </div>

      {split && (
        <div className="segmented" style={{ position: 'sticky', top: 8, zIndex: 4, boxShadow: 'var(--shadow)' }}>
          {(['dark', 'light'] as const).map((t) => (
            <button key={t} className={team === t ? 'on' : ''} onClick={() => setTeam(t)}>
              {t === 'dark' ? '⚫️' : '⚪️'} {TEAM_LABEL[t]} · {teamCount(t)}
            </button>
          ))}
        </div>
      )}

      <Lines
        team={cur}
        lines={nLines}
        lineup={lineup}
        players={players}
        selected={selectedSlot}
        armed={sel?.kind === 'pool'}
        onSlot={onSlot}
      />

      <div className="sticky-bar btn-row">
        <button className="btn ghost" disabled={busy} onClick={() => save(false)}>
          Черновик
        </button>
        <button className="btn" disabled={busy || !lineup.length} onClick={() => save(true)}>
          <Send size={17} /> Опубликовать
        </button>
      </div>
    </div>
  );
}

