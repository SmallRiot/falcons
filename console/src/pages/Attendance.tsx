import { useMemo, useState } from 'react';
import { api, type PublicUser, type Squad } from '@shared/api';
import { fmt } from '@shared/format';
import { can, Segmented, Spinner, SquadChip, toastErr, useApi, useMe } from '@shared/ui';

interface Ev {
  id: number;
  type: 'training' | 'game';
  title: string | null;
  starts_at: string;
  score_us: number | null;
  score_them: number | null;
  squads: number[];
}
interface Mark {
  event_id: number;
  user_id: number;
  status: 'in' | 'out';
  attended: number | null;
}
interface Data {
  squads: Squad[];
  events: Ev[];
  players: (PublicUser & { squads: number[] })[];
  marks: Mark[];
}

const WD = (iso: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tbilisi', weekday: 'short' }).format(new Date(iso)).replace('.', '');
const DM = (iso: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tbilisi', day: '2-digit', month: '2-digit' }).format(new Date(iso));

function monthRange(offset: number) {
  const d = new Date();
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset + 1, 1));
  return { from: from.toISOString(), to: to.toISOString(), label: fmt.month(from.toISOString().slice(0, 7)) };
}

/** Состояние клетки: был / не был / записан на будущее / не отметился. */
function cell(m: Mark | undefined, past: boolean) {
  if (!m) return past ? 'off' : 'off';
  if (m.attended === 1) return 'on mark';
  if (m.attended === 0) return 'no';
  if (m.status === 'in') return past ? 'on' : 'plan';
  return past ? 'off' : 'no';
}

function useMatrix(type: 'game' | 'training', offset: number) {
  const r = monthRange(offset);
  const q = useApi<Data>(`/api/console/attendance?type=${type}&from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`, [type, offset]);
  const marks = useMemo(() => new Map((q.data?.marks ?? []).map((m) => [`${m.event_id}:${m.user_id}`, m])), [q.data]);
  const present = (e: Ev, uid: number) => {
    const m = marks.get(`${e.id}:${uid}`);
    return m ? (m.attended ?? (m.status === 'in' ? 1 : 0)) === 1 : false;
  };
  const toggle = async (e: Ev, uid: number) => {
    const now = present(e, uid);
    // оптимистично обновляем
    q.setData((d) => {
      if (!d) return d;
      const rest = d.marks.filter((m) => !(m.event_id === e.id && m.user_id === uid));
      const prev = d.marks.find((m) => m.event_id === e.id && m.user_id === uid);
      return { ...d, marks: [...rest, { event_id: e.id, user_id: uid, status: prev?.status ?? (now ? 'out' : 'in'), attended: now ? 0 : 1 }] };
    });
    try {
      await api.put('/api/console/attendance', { event_id: e.id, user_id: uid, present: !now });
    } catch (err) {
      toastErr(err);
      void q.reload();
    }
  };
  return { ...q, range: r, marks, present, toggle };
}

function MonthSwitch({ offset, setOffset, label }: { offset: number; setOffset: (n: number) => void; label: string }) {
  return (
    <div className="hstack">
      <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label="Раньше">
        ‹
      </button>
      <b style={{ minWidth: 120, textAlign: 'center' }}>{label}</b>
      <button className="icon-btn" onClick={() => setOffset(offset + 1)} aria-label="Позже">
        ›
      </button>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span><i className="dotc on" /> был</span>
      <span><i className="dotc on mark" /> отметил тренер</span>
      <span><i className="dotc plan" /> записан</span>
      <span><i className="dotc no" /> не был / не идёт</span>
      <span>Клик по прошедшему событию — поменять отметку</span>
    </div>
  );
}

function EvHead({ e, count, blockStart, squad }: { e: Ev; count: number; blockStart?: boolean; squad?: Squad }) {
  const res = e.score_us != null && e.score_them != null ? (e.score_us > e.score_them ? 'w' : e.score_us < e.score_them ? 'l' : '') : null;
  return (
    <th className={`ev ${blockStart ? 'block-start' : ''}`}>
      <div className="dw">{WD(e.starts_at)}</div>
      <div className="dt">{DM(e.starts_at)}</div>
      {squad && <div style={{ marginTop: 3 }}><SquadChip squad={squad} /></div>}
      <div className="ttl">{e.title ?? (e.type === 'training' ? 'Тренировка' : 'Игра')}</div>
      {res !== null ? <span className={`score ${res}`}>{e.score_us}:{e.score_them}</span> : <div className="cnt">{count}</div>}
    </th>
  );
}

/* ---------------- Посещаемость игр: блоки по составам ---------------- */

export function GameAttendance() {
  const { me } = useMe();
  const [offset, setOffset] = useState(0);
  const m = useMatrix('game', offset);
  const editable = can(me, 'admin', 'coach');
  if (!m.data) return <Spinner />;
  const { squads, events, players } = m.data;
  const now = Date.now();
  // колонки: игры, сгруппированные по составам
  const cols = squads.flatMap((s) => events.filter((e) => e.squads.includes(s.id)).map((e, i) => ({ e, s, start: i === 0 })));
  const noSquad = events.filter((e) => !e.squads.length).map((e, i) => ({ e, s: undefined as Squad | undefined, start: i === 0 }));
  const allCols = [...cols, ...noSquad];
  const countFor = (e: Ev) => players.filter((p) => m.present(e, p.id)).length;

  return (
    <div className="cpage">
      <div className="c-head">
        <div>
          <h1>Посещаемость игр</h1>
          <div className="sub">У каждого состава свои игры. Игрок из нескольких составов есть в каждом своём блоке.</div>
        </div>
        <MonthSwitch offset={offset} setOffset={setOffset} label={m.range.label} />
      </div>
      <div className="c-bar">
        <Legend />
      </div>
      {!allCols.length ? (
        <div className="c-card" style={{ padding: 32 }}>
          <div className="muted center">Игр в этом месяце нет</div>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl mx">
            <thead>
              <tr>
                <th className="sticky-col">Игрок</th>
                {allCols.map(({ e, s, start }) => (
                  <EvHead key={`${s?.id}-${e.id}`} e={e} count={countFor(e)} blockStart={start} squad={s} />
                ))}
                <th className="num">Игр</th>
              </tr>
            </thead>
            <tbody>
              {squads.map((s) => {
                const members = players.filter((p) => p.squads.includes(s.id));
                if (!members.length) return null;
                return [
                  <tr key={`g${s.id}`} className="grp">
                    <td colSpan={allCols.length + 2}>
                      <SquadChip squad={s} /> {s.name} · {members.length}
                    </td>
                  </tr>,
                  ...members.map((p) => (
                    <tr key={`${s.id}-${p.id}`}>
                      <td className="sticky-col">
                        <div className="player">
                          <span className="no">{p.number ?? ''}</span>
                          {p.last_name ? `${p.last_name} ${p.first_name}` : p.first_name}
                        </div>
                      </td>
                      {allCols.map(({ e, s: cs, start }) => {
                        const relevant = !cs || cs.id === s.id;
                        const past = new Date(e.starts_at).getTime() < now;
                        const st = cell(m.marks.get(`${e.id}:${p.id}`), past);
                        return (
                          <td key={`${cs?.id}-${e.id}`} className={`c ${start ? 'block-start' : ''}`}>
                            {relevant &&
                              (editable && past ? (
                                <button className={`dotc ${st}`} onClick={() => m.toggle(e, p.id)} title={fmt.dateShort(e.starts_at)} />
                              ) : (
                                <i className={`dotc ${st}`} />
                              ))}
                          </td>
                        );
                      })}
                      <td className="num">
                        <b>{events.filter((e) => (!e.squads.length || e.squads.includes(s.id)) && m.present(e, p.id) && new Date(e.starts_at).getTime() < now).length}</b>
                      </td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Стата тренировок: общая для всех ---------------- */

export function TrainingStats() {
  const { me } = useMe();
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<'name' | 'most'>('most');
  const [squad, setSquad] = useState<number | 0>(0);
  const m = useMatrix('training', offset);
  const editable = can(me, 'admin', 'coach');
  if (!m.data) return <Spinner />;
  const { squads, events, players } = m.data;
  const now = Date.now();
  const past = events.filter((e) => new Date(e.starts_at).getTime() < now);
  const total = (uid: number) => past.filter((e) => m.present(e, uid)).length;
  const sqMap = new Map(squads.map((s) => [s.id, s]));
  const rows = players
    .filter((p) => !squad || p.squads.includes(squad))
    .sort((a, b) => (sort === 'most' ? total(b.id) - total(a.id) : 0) || `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`));

  return (
    <div className="cpage">
      <div className="c-head">
        <div>
          <h1>Стата тренировок</h1>
          <div className="sub">Тренировки общие для всех составов · проведено {past.length} из {events.length}</div>
        </div>
        <MonthSwitch offset={offset} setOffset={setOffset} label={m.range.label} />
      </div>
      <div className="c-bar">
        <div style={{ width: 260 }}>
          <Segmented value={sort} onChange={setSort} options={[['most', 'Чаще всех'], ['name', 'По фамилии']]} />
        </div>
        <select className="input" value={squad} onChange={(e) => setSquad(Number(e.target.value))}>
          <option value={0}>Все составы</option>
          {squads.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Legend />
      </div>
      <div className="tbl-wrap">
        <table className="tbl mx">
          <thead>
            <tr>
              <th className="sticky-col">Кто</th>
              <th>Состав</th>
              {events.map((e) => (
                <EvHead key={e.id} e={e} count={players.filter((p) => m.present(e, p.id)).length} />
              ))}
              <th className="num">Всего</th>
              <th className="num">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const t = total(p.id);
              return (
                <tr key={p.id}>
                  <td className="sticky-col">
                    <div className="player">
                      <span className="no">{p.number ?? ''}</span>
                      {p.last_name ? `${p.last_name} ${p.first_name}` : p.first_name}
                    </div>
                  </td>
                  <td>
                    <div className="chips" style={{ flexWrap: 'nowrap' }}>
                      {p.squads.map((id) => sqMap.get(id) && <SquadChip key={id} squad={sqMap.get(id)!} />)}
                    </div>
                  </td>
                  {events.map((e) => {
                    const isPast = new Date(e.starts_at).getTime() < now;
                    const st = cell(m.marks.get(`${e.id}:${p.id}`), isPast);
                    return (
                      <td key={e.id} className="c">
                        {editable && isPast ? <button className={`dotc ${st}`} onClick={() => m.toggle(e, p.id)} /> : <i className={`dotc ${st}`} />}
                      </td>
                    );
                  })}
                  <td className="num">
                    <b>{t}</b>
                  </td>
                  <td className="num muted">{past.length ? Math.round((t / past.length) * 100) : 0}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
