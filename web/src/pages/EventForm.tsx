import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type EventDetail } from '@shared/api';
import { fromLocalInput, toLocalInput } from '@shared/format';
import { Segmented, Spinner, SquadPicker, useAction, useApi, useMe } from '@shared/ui';

const LAST_KEY = 'falcons.lastEvent';

function nextWeekdayAt(h: number, m: number) {
  const d = new Date(Date.now() + 864e5);
  d.setUTCHours(h - 4, m, 0, 0);
  return d.toISOString();
}

export default function EventForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const editing = !!id;
  const existing = useApi<EventDetail>(editing ? `/api/events/${id}` : null, [id]);
  const { busy, run } = useAction();
  const { me } = useMe();
  const [f, setF] = useState(() => {
    let last: { location?: string; capacity?: string; time?: string } = {};
    try {
      last = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}');
    } catch {
      /* нет хранилища */
    }
    return {
      type: 'training' as 'training' | 'game',
      title: '',
      when: toLocalInput(nextWeekdayAt(21, 30)),
      duration_min: '90',
      location: last.location ?? '',
      capacity: last.capacity ?? '',
      notes: '',
      notify: true,
      squad_ids: [] as number[],
      score_us: '',
      score_them: '',
    };
  });

  useEffect(() => {
    const e = existing.data;
    if (!e) return;
    setF({
      type: e.type,
      title: e.title ?? '',
      when: toLocalInput(e.starts_at),
      duration_min: String(e.duration_min),
      location: e.location ?? '',
      capacity: e.capacity ? String(e.capacity) : '',
      notes: e.notes ?? '',
      notify: false,
      squad_ids: e.squads.map((s) => s.id),
      score_us: e.score_us != null ? String(e.score_us) : '',
      score_them: e.score_them != null ? String(e.score_them) : '',
    });
  }, [existing.data]);

  if (editing && existing.loading) return <Spinner />;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = () =>
    run(async () => {
      const body = {
        type: f.type,
        title: f.title,
        starts_at: fromLocalInput(f.when),
        duration_min: Number(f.duration_min),
        location: f.location,
        capacity: f.capacity ? Number(f.capacity) : null,
        notes: f.notes,
        notify: f.notify,
        squad_ids: f.type === 'game' ? f.squad_ids : [],
        score_us: f.score_us === '' ? null : Number(f.score_us),
        score_them: f.score_them === '' ? null : Number(f.score_them),
      };
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ location: f.location, capacity: f.capacity }));
      } catch {
        /* ок */
      }
      if (editing) {
        await api.patch(`/api/events/${id}`, body);
        nav(`/events/${id}`, { replace: true });
      } else {
        const e = await api.post<{ id: number }>('/api/events', body);
        nav(`/events/${e.id}`, { replace: true });
      }
    }, editing ? 'Сохранено' : f.notify ? 'Создано, бот написал в чат' : 'Создано');

  return (
    <div className="page">
      <div className="page-head">
        <h1>{editing ? 'Редактирование' : 'Новое событие'}</h1>
      </div>
      <div className="card form">
        <Segmented
          value={f.type}
          onChange={(v) => set('type', v)}
          options={[
            ['training', '🏒 Тренировка'],
            ['game', '🥅 Игра'],
          ]}
        />
        {f.type === 'game' ? (
          <div className="field">
            <span>Какой состав играет</span>
            <SquadPicker squads={me.squads ?? []} value={f.squad_ids} onChange={(v) => set('squad_ids', v)} />
            {!f.squad_ids.length && <span className="small" style={{ color: 'var(--warn)' }}>Не выбран — игру увидят все</span>}
          </div>
        ) : (
          <div className="muted small">Тренировки общие — их видят все составы.</div>
        )}
        <label className="field">
          <span>Дата и время (Тбилиси)</span>
          <input className="input" type="datetime-local" value={f.when} onChange={(e) => set('when', e.target.value)} />
        </label>
        <label className="field">
          <span>{f.type === 'game' ? 'Соперник / турнир' : 'Название (необязательно)'}</span>
          <input
            className="input"
            value={f.title}
            placeholder={f.type === 'game' ? 'vs Tbilisi Wolves' : 'Например: катание + броски'}
            onChange={(e) => set('title', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Место</span>
          <input className="input" value={f.location} placeholder="Каток" onChange={(e) => set('location', e.target.value)} />
        </label>
        <div className="form-row">
          <label className="field">
            <span>Длительность, мин</span>
            <input className="input" inputMode="numeric" value={f.duration_min} onChange={(e) => set('duration_min', e.target.value)} />
          </label>
          <label className="field">
            <span>Лимит мест</span>
            <input className="input" inputMode="numeric" value={f.capacity} placeholder="без лимита" onChange={(e) => set('capacity', e.target.value)} />
          </label>
        </div>
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
            Сообщить в командный чат
          </label>
        )}
      </div>
      <button className="btn block" disabled={busy || !f.when} onClick={submit}>
        {editing ? 'Сохранить' : 'Создать и открыть запись'}
      </button>
    </div>
  );
}
