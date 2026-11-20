import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Выбор нескольких дней в календаре — «вот эти дни, в такое-то время».
 * Даты — строки YYYY-MM-DD по Тбилиси.
 */
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
/** «сегодня» по Тбилиси (UTC+4) */
export function tbilisiToday() {
  const t = new Date(Date.now() + 4 * 3600e3);
  return ymd(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export function DatesPicker({
  value,
  onChange,
  marked = [],
}: {
  value: string[];
  onChange: (v: string[]) => void;
  /** дни, где уже есть события — точка под числом */
  marked?: string[];
}) {
  const today = tbilisiToday();
  const [cursor, setCursor] = useState(() => {
    const t = parse(value[0] ?? today);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() };
  });
  const sel = useMemo(() => new Set(value), [value]);
  const mark = useMemo(() => new Set(marked), [marked]);

  const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => ymd(cursor.y, cursor.m, i + 1))];
  while (cells.length % 7) cells.push(null);

  const shift = (d: number) => setCursor((c) => {
    const t = new Date(Date.UTC(c.y, c.m + d, 1));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() };
  });
  const toggle = (d: string) => onChange(sel.has(d) ? value.filter((x) => x !== d) : [...value, d].sort());

  return (
    <div className="dp">
      <div className="dp-head">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Предыдущий месяц">
          <ChevronLeft size={18} />
        </button>
        <b>
          {MONTHS[cursor.m]} {cursor.y}
        </b>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Следующий месяц">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="dp-grid">
        {WD.map((w) => (
          <div key={w} className="dp-wd">
            {w}
          </div>
        ))}
        {cells.map((c, i) =>
          c ? (
            <button
              type="button"
              key={c}
              disabled={c < today}
              className={`dp-day ${sel.has(c) ? 'on' : ''} ${c === today ? 'today' : ''}`}
              onClick={() => toggle(c)}
            >
              {Number(c.slice(8))}
              {mark.has(c) && <i />}
            </button>
          ) : (
            <span key={`e${i}`} />
          ),
        )}
      </div>

      <div className="dp-foot">
        <span className="small">
          {value.length ? (
            <>
              Выбрано: <b>{value.length}</b>
            </>
          ) : (
            <span className="muted">Тапни по дням в календаре</span>
          )}
        </span>
        {value.length > 0 && (
          <button type="button" className="btn ghost sm" onClick={() => onChange([])}>
            Очистить
          </button>
        )}
      </div>
    </div>
  );
}
