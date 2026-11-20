import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, LayoutGrid, Pencil, Plus } from 'lucide-react';
import { api, type EventSummary } from '@shared/api';
import { DEFAULT_LOCATION, fmt, fromLocalInput, plural, toLocalInput } from '@shared/format';
import { DatesPicker } from '@shared/DatesPicker';
import { Segmented, Spinner, SquadChip, SquadPicker, toast, useAction, useApi, useMe } from '@shared/ui';
import Drawer from '../Drawer';

type Scope = 'upcoming' | 'past';
type Kind = 'all' | 'training' | 'game';

export default function Schedule() {
  const { me } = useMe();
  const nav = useNavigate();
  const [scope, setScope] = useState<Scope>('upcoming');
  const [kind, setKind] = useState<Kind>('all');
  const [squad, setSquad] = useState(0);
  const { data, loading, reload } = useApi<EventSummary[]>(`/api/events?all=1&scope=${scope}`, [scope]);
  const [edit, setEdit] = useState<EventSummary | 'new' | null>(null);
  const { busy, run } = useAction();

  const rows = (data ?? [])
    .filter((e) => kind === 'all' || e.type === kind)
    .filter((e) => !squad || e.squads.some((s) => s.id === squad));

  return (
    <div className="cpage">
      <div className="c-head">
        <div>
          <h1>Расписание и пятёрки</h1>
          <div className="sub">Тренировки общие для всех, у игр — свой состав</div>
        </div>
        <button className="btn" onClick={() => setEdit('new')}>
          <Plus size={18} /> Новое событие
        </button>
      </div>
      <div className="c-bar">
        <div style={{ width: 280 }}>
          <Segmented value={scope} onChange={setScope} options={[['upcoming', 'Предстоящие'], ['past', 'Прошедшие']]} />
        </div>
        <div style={{ width: 320 }}>
          <Segmented value={kind} onChange={setKind} options={[['all', 'Все'], ['training', 'Тренировки'], ['game', 'Игры']]} />
        </div>
        <select className="input" value={squad} onChange={(e) => setSquad(Number(e.target.value))}>
          <option value={0}>Все составы</option>
          {(me.squads ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Время</th>
                <th className="sticky-col">Событие</th>
                <th>Состав</th>
                <th className="num">Идут</th>
                <th className="num">Не идут</th>
                <th>Пятёрки</th>
                {scope === 'past' && <th>Счёт</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} style={{ opacity: e.cancelled ? 0.5 : 1 }}>
                  <td>
                    <b>{fmt.day(e.starts_at)}</b>
                  </td>
                  <td>{fmt.time(e.starts_at)}</td>
                  <td className="sticky-col">
                    <div className="hstack" style={{ gap: 6 }}>
                      <b>{e.type === 'game' ? e.title ?? 'Игра' : e.title || 'Тренировка'}</b>
                      {e.type === 'game' && <span className="chip game">Игра</span>}
                      {e.cancelled && <span className="chip bad">Отменено</span>}
                    </div>
                  </td>
                  <td>
                    {e.squads.length ? (
                      <div className="chips" style={{ flexWrap: 'nowrap' }}>
                        {e.squads.map((s) => (
                          <SquadChip key={s.id} squad={s} />
                        ))}
                      </div>
                    ) : (
                      <span className="muted">весь клуб</span>
                    )}
                  </td>
                  <td className="num">
                    <b>{e.going}</b>
                    {e.capacity ? <span className="muted"> / {e.capacity}</span> : null}
                  </td>
                  <td className="num muted">{e.out}</td>
                  <td>{e.lineup_published ? <span className="chip ok">опубликованы</span> : <span className="muted">—</span>}</td>
                  {scope === 'past' && <td>{e.score_us != null && e.score_them != null ? <b>{e.score_us}:{e.score_them}</b> : <span className="muted">—</span>}</td>}
                  <td>
                    <div className="hstack" style={{ justifyContent: 'flex-end' }}>
                      {!e.cancelled && (
                        <button className="btn secondary xs" onClick={() => nav(`/schedule/${e.id}/lineup`)}>
                          <LayoutGrid size={14} /> Пятёрки
                        </button>
                      )}
                      <button className="btn ghost xs" onClick={() => setEdit(e)}>
                        <Pencil size={14} /> Изменить
                      </button>
                      {!e.cancelled && scope === 'upcoming' && (
                        <button
                          className="btn bad-soft xs"
                          disabled={busy}
                          onClick={() =>
                            confirm('Отменить событие? Пост в чате обновится.') &&
                            run(async () => {
                              await api.patch(`/api/events/${e.id}`, { cancelled: 1 });
                              await reload();
                            }, 'Отменено')
                          }
                        >
                          <Ban size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="muted center" style={{ padding: 32 }}>Пусто</div>}
        </div>
      )}
      <EventDrawer
        marked={scope === 'upcoming' ? (data ?? []).filter((e) => !e.cancelled).map((e) => toLocalInput(e.starts_at).slice(0, 10)) : []}
        value={edit}
        onClose={() => setEdit(null)}
        onSaved={async () => {
          setEdit(null);
          await reload();
        }}
      />
    </div>
  );
}

function defaultStart() {
  const d = new Date(Date.now() + 864e5);
  d.setUTCHours(17, 30, 0, 0); // 21:30 по Тбилиси
  return d.toISOString();
}

function EventDrawer({ value, onClose, onSaved, marked }: { value: EventSummary | 'new' | null; onClose: () => void; onSaved: () => Promise<void>; marked: string[] }) {
  const { me } = useMe();
  const editing = value && value !== 'new' ? value : null;
  const [f, setF] = useState({ type: 'training' as 'training' | 'game', title: '', when: '', days: [] as string[], time: '21:30', location: DEFAULT_LOCATION, duration_min: '90', capacity: '', notes: '', squad_ids: [] as number[], score_us: '', score_them: '', notify: true });
  const { busy, run } = useAction();
  useEffect(() => {
    if (!value) return;
    const e = editing;
    setF({
      type: e?.type ?? 'training',
      title: e?.title ?? '',
      when: toLocalInput(e?.starts_at ?? defaultStart()),
      days: [],
      time: e ? toLocalInput(e.starts_at).slice(11, 16) : '21:30',
      location: e ? e.location ?? '' : DEFAULT_LOCATION,
      duration_min: String(e?.duration_min ?? 90),
      capacity: e?.capacity ? String(e.capacity) : '',
      notes: e?.notes ?? '',
      squad_ids: e?.squads.map((s) => s.id) ?? [],
      score_us: e?.score_us != null ? String(e.score_us) : '',
      score_them: e?.score_them != null ? String(e.score_them) : '',
      notify: !e,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () =>
    run(async () => {
      const body = {
        type: f.type,
        title: f.title,
        starts_at: editing ? fromLocalInput(f.when) : undefined,
        starts_at_list: editing ? undefined : f.days.map((d) => fromLocalInput(`${d}T${f.time}`)),
        location: f.location,
        duration_min: Number(f.duration_min),
        capacity: f.capacity ? Number(f.capacity) : null,
        notes: f.notes,
        squad_ids: f.type === 'game' ? f.squad_ids : [],
        score_us: f.score_us === '' ? null : Number(f.score_us),
        score_them: f.score_them === '' ? null : Number(f.score_them),
        notify: f.notify,
      };
      if (editing) await api.patch(`/api/events/${editing.id}`, body);
      else {
        const r = await api.post<{ count: number; announced: number }>('/api/events', body);
        toast(
          `Создано ${r.count} ${plural(r.count, 'событие', 'события', 'событий')}` +
            (f.notify ? (r.announced === r.count ? ', бот написал в чат' : ` · в чат сейчас ${r.announced}, остальные — за неделю до`) : ''),
        );
      }
      await onSaved();
    }, editing ? 'Сохранено' : undefined);

  return (
    <Drawer open={!!value} onClose={onClose} title={editing ? 'Изменить событие' : 'Новое событие'}>
      <Segmented value={f.type} onChange={(v) => set('type', v)} options={[['training', '🏒 Тренировка'], ['game', '🥅 Игра']]} />
      {f.type === 'game' ? (
        <div className="field">
          <span>Какой состав играет</span>
          <SquadPicker squads={me.squads ?? []} value={f.squad_ids} onChange={(v) => set('squad_ids', v)} />
        </div>
      ) : (
        <div className="muted small">Тренировки общие — их видят все составы.</div>
      )}
      {editing ? (
        <div className="form-row">
          <label className="field">
            <span>Дата и время (Тбилиси)</span>
            <input className="input" type="datetime-local" value={f.when} onChange={(e) => set('when', e.target.value)} />
          </label>
          <label className="field" style={{ maxWidth: 140 }}>
            <span>Минут</span>
            <input className="input" inputMode="numeric" value={f.duration_min} onChange={(e) => set('duration_min', e.target.value)} />
          </label>
        </div>
      ) : (
        <>
          <div className="field">
            <span>Дни — отметь в календаре, можно сразу на месяц вперёд</span>
            <DatesPicker value={f.days} onChange={(v) => set('days', v)} marked={marked} />
          </div>
          <div className="form-row">
            <label className="field">
              <span>Время начала (Тбилиси)</span>
              <input className="input" type="time" value={f.time} onChange={(e) => set('time', e.target.value)} />
            </label>
            <label className="field" style={{ maxWidth: 140 }}>
              <span>Минут</span>
              <input className="input" inputMode="numeric" value={f.duration_min} onChange={(e) => set('duration_min', e.target.value)} />
            </label>
          </div>
        </>
      )}
      <label className="field">
        <span>Место</span>
        <input className="input" value={f.location} placeholder={DEFAULT_LOCATION} onChange={(e) => set('location', e.target.value)} />
      </label>
      <label className="field">
        <span>{f.type === 'game' ? 'Соперник' : 'Название (необязательно)'}</span>
        <input className="input" value={f.title} placeholder={f.type === 'game' ? 'vs Tbilisi Wolves' : 'Двусторонка, ОФП, броски…'} onChange={(e) => set('title', e.target.value)} />
      </label>
      <label className="field">
        <span>Лимит мест</span>
        <input className="input" inputMode="numeric" value={f.capacity} placeholder="без лимита" onChange={(e) => set('capacity', e.target.value)} />
      </label>
      {editing && f.type === 'game' && (
        <div className="form-row">
          <label className="field">
            <span>Забили мы</span>
            <input className="input" inputMode="numeric" value={f.score_us} onChange={(e) => set('score_us', e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="field">
            <span>Пропустили</span>
            <input className="input" inputMode="numeric" value={f.score_them} onChange={(e) => set('score_them', e.target.value.replace(/\D/g, ''))} />
          </label>
        </div>
      )}
      <label className="field">
        <span>Заметка</span>
        <textarea className="input" value={f.notes} placeholder="Форма, что взять, сбор за 30 минут…" onChange={(e) => set('notes', e.target.value)} />
      </label>
      {!editing && (
        <label className="check">
          <input type="checkbox" checked={f.notify} onChange={(e) => set('notify', e.target.checked)} />
          Пост в командный чат с кнопками «Иду / Не иду»{f.days.length > 1 ? ' — каждое событие за неделю до' : ''}
        </label>
      )}
      <button className="btn block" disabled={busy || (editing ? !f.when : !f.days.length || !f.time)} onClick={save}>
        {editing ? 'Сохранить' : f.days.length > 1 ? `Создать ${f.days.length} ${plural(f.days.length, 'событие', 'события', 'событий')}` : 'Создать'}
      </button>
    </Drawer>
  );
}
