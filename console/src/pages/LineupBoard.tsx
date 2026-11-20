import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eraser, Image, Send, Sparkles, UserPlus } from 'lucide-react';
import { GuestAdd } from '@shared/GuestAdd';
import { api, fetchBlobUrl, type EventDetail, type LineupItem, type PublicUser, type Team } from '@shared/api';
import { fmt, POS_SHORT } from '@shared/format';
import { autoFill, autoFillSplit, DEF, FWD, GOALIES, LINE_COLORS, SLOT_LABEL } from '@shared/lineup';
import { ask, Segmented, Spinner, toast, toastErr, useApi } from '@shared/ui';
import Drawer from '../Drawer';

type Pos = { team: Team; line: number; slot: string };
type Sel = { kind: 'pool'; userId: number } | ({ kind: 'slot' } & Pos) | null;
const same = (i: Pos, p: Pos) => i.team === p.team && i.line === p.line && i.slot === p.slot;
const posOf = (slot: string) => (slot.startsWith('G') ? 'G' : slot.endsWith('D') ? 'D' : 'F');

export default function LineupBoard() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: ev, loading, setData } = useApi<EventDetail>(`/api/events/${id}`, [id]);
  const [guestOpen, setGuestOpen] = useState(false);
  // расстановку берём из базы один раз на событие — добавление гостя не сбрасывает несохранённое
  const inited = useRef<number | null>(null);
  const [lineup, setLineup] = useState<LineupItem[]>([]);
  const [split, setSplit] = useState(true);
  const [lines, setLines] = useState<'3' | '4'>('3');
  const [sel, setSel] = useState<Sel>(null);
  const [over, setOver] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!ev || inited.current === ev.id) return;
    inited.current = ev.id;
    const going = new Set(ev.players.map((p) => p.id));
    setLineup(ev.lineup.filter((i) => going.has(i.user_id)));
    setSplit(ev.lineup.length ? ev.lineup.some((l) => l.team !== '') : ev.type === 'training');
    if (ev.lineup.some((l) => l.line === 4)) setLines('4');
  }, [ev]);

  const players = useMemo(() => new Map<number, PublicUser>((ev?.players ?? []).map((p) => [p.id, p])), [ev]);
  if (loading || !ev) return <Spinner />;
  const nLines = Number(lines);
  const placed = new Set(lineup.map((i) => i.user_id));
  const pool = ev.players
    .filter((p) => !placed.has(p.id))
    .filter((p) => !q || `${p.name} ${p.number ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.position ?? 'F').localeCompare(b.position ?? 'F') || a.name.localeCompare(b.name));
  const teams: Team[] = split ? ['dark', 'light'] : [''];

  /* ---- операции ---- */
  const place = (userId: number, to: Pos) =>
    setLineup((l) => {
      const from = l.find((i) => i.user_id === userId);
      const target = l.find((i) => same(i, to));
      const rest = l.filter((i) => i !== from && i !== target);
      rest.push({ user_id: userId, ...to });
      if (target && from) rest.push({ ...target, team: from.team, line: from.line, slot: from.slot }); // поменять местами
      return rest;
    });
  const removeUser = (userId: number) => setLineup((l) => l.filter((i) => i.user_id !== userId));

  const clickCell = (p: Pos) => {
    const here = lineup.find((i) => same(i, p));
    if (sel?.kind === 'pool') {
      place(sel.userId, p);
      return setSel(null);
    }
    if (sel?.kind === 'slot') {
      if (same(sel, p)) {
        if (here) removeUser(here.user_id);
        return setSel(null);
      }
      const from = lineup.find((i) => same(i, sel));
      if (from) place(from.user_id, p);
      return setSel(null);
    }
    if (here) setSel({ kind: 'slot', ...p });
  };

  /* ---- drag & drop ---- */
  const dragStart = (e: DragEvent, userId: number) => e.dataTransfer.setData('text/plain', String(userId));
  const dropOn = (e: DragEvent, p: Pos) => {
    e.preventDefault();
    setOver(null);
    const uid = Number(e.dataTransfer.getData('text/plain'));
    if (uid) place(uid, p);
  };
  const dropPool = (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const uid = Number(e.dataTransfer.getData('text/plain'));
    if (uid) removeUser(uid);
  };

  const save = async (publish: boolean) => {
    setBusy(true);
    try {
      const r = await api.put<{ notified: number }>(`/api/events/${ev.id}/lineup`, { items: lineup.filter((i) => i.line <= nLines), publish });
      toast(publish ? `Опубликовано · картинка ушла в чат, ${r.notified} игрокам в личку` : 'Черновик сохранён');
      return true;
    } catch (e) {
      toastErr(e);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const showPreview = async () => {
    if (!(await save(false))) return;
    try {
      setPreview(await fetchBlobUrl(`/api/events/${ev.id}/lineup.png?t=${Date.now()}`));
    } catch (e) {
      toastErr(e);
    }
  };

  const Cell = ({ p }: { p: Pos }) => {
    const item = lineup.find((i) => same(i, p));
    const pl = item ? players.get(item.user_id) : undefined;
    const key = `${p.team}:${p.line}:${p.slot}`;
    const mispos = pl && pl.position && pl.position !== posOf(p.slot);
    return (
      <div
        className={`cell ${pl ? 'filled' : ''} ${over === key ? 'over' : ''} ${sel?.kind === 'slot' && same(sel, p) ? 'sel' : ''} ${mispos ? 'mispos' : ''}`}
        draggable={!!pl}
        onDragStart={(e) => pl && dragStart(e, pl.id)}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(key);
        }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => dropOn(e, p)}
        onClick={() => clickCell(p)}
        title={pl ? 'Перетащи или кликни, чтобы поменять' : 'Перетащи сюда игрока'}
      >
        <span className="pl">{SLOT_LABEL[p.slot]}</span>
        <span className="nm">{pl ? `${pl.number != null ? `#${pl.number} ` : ''}${pl.first_name} ${pl.last_name?.[0] ?? ''}.` : ''}</span>
      </div>
    );
  };

  return (
    <div className="cpage">
      <div className="c-head">
        <div>
          <button className="btn ghost xs" style={{ marginBottom: 8 }} onClick={() => nav('/schedule')}>
            <ArrowLeft size={14} /> Расписание
          </button>
          <h1>
            Пятёрки · {ev.type === 'game' ? ev.title ?? 'игра' : ev.title || 'тренировка'}
          </h1>
          <div className="sub">
            {fmt.dayLong(ev.starts_at)}, {fmt.time(ev.starts_at)} · записались {ev.players.length} · {ev.lineup_published ? 'опубликованы' : 'не опубликованы'}
          </div>
        </div>
        <div className="hstack wrap">
          <button className="btn ghost sm" disabled={busy} onClick={showPreview}>
            <Image size={16} /> Картинка для чата
          </button>
          <button className="btn ghost sm" disabled={busy} onClick={() => save(false)}>
            Сохранить черновик
          </button>
          <button className="btn sm" disabled={busy || !lineup.length} onClick={async () => (await save(true)) && nav('/schedule')}>
            <Send size={16} /> Опубликовать
          </button>
        </div>
      </div>

      <div className="c-bar">
        <div style={{ width: 300 }}>
          <Segmented
            value={split ? 'split' : 'one'}
            onChange={async (v) => {
              if ((v === 'split') === split) return;
              if (lineup.length && !await ask('Сбросить текущую расстановку?')) return;
              setLineup([]);
              setSplit(v === 'split');
            }}
            options={[['split', 'Тёмные / Светлые'], ['one', 'Одна команда']]}
          />
        </div>
        <div style={{ width: 220 }}>
          <Segmented
            value={lines}
            onChange={(v) => {
              setLines(v);
              if (v === '3') setLineup((l) => l.filter((i) => i.line <= 3));
            }}
            options={[['3', '3 звена'], ['4', '4 звена']]}
          />
        </div>
        <button className="btn secondary sm" onClick={() => setLineup(split ? autoFillSplit(ev.players, nLines) : autoFill(ev.players, nLines))}>
          <Sparkles size={16} /> Авто по позициям
        </button>
        <button className="btn ghost sm" onClick={() => setLineup([])}>
          <Eraser size={16} /> Очистить
        </button>
        <span className="muted small">Перетаскивай мышкой или кликай: игрок → клетка. Клик по занятой клетке и ещё раз — убрать.</span>
      </div>

      <div className="board">
        <div className="c-card pad pool-card">
          <h3>
            Без места · {ev.players.length - placed.size}
            <span className="muted small" style={{ fontWeight: 500 }}>из {ev.players.length}</span>
          </h3>
          <div className="hstack" style={{ gap: 6, marginBottom: 10 }}>
            <input className="input" style={{ height: 38 }} placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn secondary sm" title="Записать гостя без Telegram" onClick={() => setGuestOpen(true)}>
              <UserPlus size={16} /> Гость
            </button>
          </div>
          <div
            className={`pool-list ${over === 'pool' ? 'over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver('pool');
            }}
            onDragLeave={() => setOver(null)}
            onDrop={dropPool}
          >
            {pool.map((p) => (
              <div
                key={p.id}
                className={`pitem ${sel?.kind === 'pool' && sel.userId === p.id ? 'sel' : ''}`}
                draggable
                onDragStart={(e) => dragStart(e, p.id)}
                onClick={() => setSel((s) => (s?.kind === 'pool' && s.userId === p.id ? null : { kind: 'pool', userId: p.id }))}
              >
                <span className="jersey">{p.number ?? '–'}</span>
                {p.name}
                {p.guest && <span className="chip info" style={{ height: 20, fontSize: 11 }}>гость</span>}
                <span className="pos">{p.position ? POS_SHORT[p.position] : ''}</span>
              </div>
            ))}
            {!pool.length && <div className="muted small center" style={{ padding: 16 }}>{ev.players.length ? 'Все расставлены 👌' : 'Никто не записался'}</div>}
          </div>
        </div>

        <div className={`teams ${split ? 'two' : ''}`}>
          {teams.map((t) => (
            <div key={t || 'one'} className={`team-col ${t === 'dark' || !split ? 'dark' : ''}`}>
              <h3>
                {t === 'dark' ? '⚫️ Тёмные' : t === 'light' ? '⚪️ Светлые' : '🦅 Состав'}
                <span style={{ fontWeight: 600, fontSize: 12, opacity: 0.7 }}>{lineup.filter((i) => i.team === t && i.line <= nLines).length} игроков</span>
              </h3>
              {Array.from({ length: nLines }, (_, i) => i + 1).map((line) => (
                <div key={line} className="lrow">
                  <div className="lnum" style={{ background: LINE_COLORS[line - 1] }}>
                    {line}
                  </div>
                  {FWD.map((s) => (
                    <Cell key={s} p={{ team: t, line, slot: s }} />
                  ))}
                  <div />
                  {DEF.map((s) => (
                    <Cell key={s} p={{ team: t, line, slot: s }} />
                  ))}
                </div>
              ))}
              <div className="lrow g" style={{ marginTop: 10 }}>
                <div className="lnum" style={{ background: '#5b6b78' }}>
                  В
                </div>
                {GOALIES.map((s) => (
                  <Cell key={s} p={{ team: t, line: 0, slot: s }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Drawer open={!!preview} onClose={() => setPreview(null)} title="Так увидят в чате">
        {preview && <img className="lineup-preview" src={preview} alt="Пятёрки" />}
        <div className="muted small">В личку каждый получит такую же картинку со своей подсветкой.</div>
        <button
          className="btn block"
          disabled={busy}
          onClick={async () => {
            if (await save(true)) {
              setPreview(null);
              nav('/schedule');
            }
          }}
        >
          <Send size={16} /> Опубликовать
        </button>
      </Drawer>
      <Drawer open={guestOpen} onClose={() => setGuestOpen(false)} title="Гость на событие">
        {guestOpen && (
          <GuestAdd
            eventId={ev.id}
            already={ev.players.map((p) => p.id)}
            onAdded={async () => {
              const fresh = await api.get<EventDetail>(`/api/events/${ev.id}`);
              setData((d) => (d ? { ...d, players: fresh.players, notGoing: fresh.notGoing, going: fresh.going } : d));
            }}
          />
        )}
      </Drawer>
    </div>
  );
}
