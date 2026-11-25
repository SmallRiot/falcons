import { t } from './i18n';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, ImagePlus, X } from 'lucide-react';
import { api, fetchFileUrl, type Me, type NickStyle, type Squad } from './api';
import { haptic } from './tg';

/* ---------- контекст «я» ---------- */

export const MeCtx = createContext<{ me: Me; refresh: () => Promise<void> }>(null as never);
export const useMe = () => useContext(MeCtx);
export const can = (me: Me, ...roles: string[]) => me.user.roles.some((r) => roles.includes(r));

/* ---------- загрузка данных ---------- */

export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!url) return;
    try {
      setData(await api.get<T>(url));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

/* ---------- тосты ---------- */

type ToastT = { id: number; text: string; err?: boolean };
let pushToast: (t: Omit<ToastT, 'id'>) => void = () => {};
export const toast = (text: string) => {
  haptic.ok();
  pushToast({ text });
};
export const toastErr = (e: unknown) => {
  haptic.err();
  pushToast({ text: e instanceof Error ? e.message : String(e), err: true });
};

/* ---------- подтверждение ----------
 * Свои окна вместо window.confirm/prompt: в Telegram и встроенных браузерах системные
 * диалоги часто сразу возвращают «нет», и кнопка «ничего не делает».
 */
type AskT = { text: string; okText: string; danger?: boolean; input?: { value: string; placeholder?: string }; done: (v: string | null) => void };
let pushAsk: (a: AskT) => void = () => {};
/** await ask('Удалить?') → true/false */
export const ask = (text: string, opts: { okText?: string; danger?: boolean } = {}) =>
  new Promise<boolean>((done) => pushAsk({ text, okText: opts.okText ?? t('Да'), danger: opts.danger, done: (v) => done(v !== null) }));
/** await askText('Сумма?', '100') → строка или null */
export const askText = (text: string, value = '', placeholder?: string) =>
  new Promise<string | null>((done) => pushAsk({ text, okText: 'OK', input: { value, placeholder }, done }));

function AskHost() {
  const [a, setA] = useState<AskT | null>(null);
  const [v, setV] = useState('');
  useEffect(() => {
    pushAsk = (x) => {
      setV(x.input?.value ?? '');
      setA(x);
    };
  }, []);
  if (!a) return null;
  const close = (res: string | null) => {
    setA(null);
    a.done(res);
  };
  return (
    <div className="ask-backdrop" onClick={() => close(null)}>
      <div className="ask" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="ask-text">{a.text}</div>
        {a.input && (
          <input
            className="input"
            autoFocus
            inputMode="decimal"
            value={v}
            placeholder={a.input.placeholder}
            onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && close(v)}
          />
        )}
        <div className="btn-row">
          <button className="btn ghost" onClick={() => close(null)}>
            {t('Отмена')}
          </button>
          <button className={`btn ${a.danger ? 'bad' : ''}`} autoFocus={!a.input} onClick={() => close(a.input ? v : '')}>
            {a.okText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toaster() {
  return (
    <>
      <ToastHost />
      <AskHost />
    </>
  );
}

function ToastHost() {
  const [t, setT] = useState<ToastT | null>(null);
  useEffect(() => {
    pushToast = (x) => setT({ ...x, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(null), 2600);
    return () => clearTimeout(h);
  }, [t]);
  if (!t) return null;
  return (
    <div key={t.id} className={`toast ${t.err ? 'err' : ''}`} role="status">
      {!t.err && <Check size={16} />}
      {t.text}
    </div>
  );
}

/** Выполняет действие с индикатором и тостом об ошибке. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true);
    try {
      await fn();
      if (okText) toast(okText);
      return true;
    } catch (e) {
      toastErr(e);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}

/* ---------- базовые компоненты ---------- */

const AVATAR_COLORS = ['#2b88cf', '#1c6aa8', '#5b8fb0', '#3a6f96', '#0d6e8a', '#4a7fa8', '#26567d', '#6c9bbd'];

type StyledUser = { id: number; first_name: string; last_name?: string | null; photo_url?: string | null; style?: NickStyle | null };
export function Avatar({ user, size }: { user: StyledUser; size?: 'sm' | 'lg' }) {
  const initials = ((user.first_name?.[0] ?? '') + (user.last_name?.[0] ?? '')).toUpperCase() || '?';
  const av = (
    <span className={`avatar ${size ?? ''}`} style={{ background: AVATAR_COLORS[Math.abs(user.id) % AVATAR_COLORS.length] }}>
      {user.photo_url ? <img src={user.photo_url} alt="" loading="lazy" /> : initials}
    </span>
  );
  // рамка из магазина (или DEV-кольцо владельца): вращающийся градиент + свечение вокруг аватарки
  const frame = user.style?.frame ? (user.style.frame === true ? 'gold' : user.style.frame) : user.style?.dev ? 'dev' : null;
  if (!frame) return av;
  return (
    <span className={`avatar-ring ring-${frame} ${size ?? ''}`}>
      {av}
      {/* искры, бегающие по кругу */}
      {size !== 'sm' && (
        <span className="ring-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      {/* «Грозный факел»: языки пламени над аватаркой */}
      {frame === 'torch' && (
        <span className="ring-flames" aria-hidden="true">
          {Array.from({ length: 11 }, (_, k) => (
            <i key={k} style={{ ['--k' as string]: k } as React.CSSProperties} />
          ))}
        </span>
      )}
    </span>
  );
}

/** Имя с оформлением из магазина игры: цветной или огненный ник, эмодзи. */
export function Nick({ user, text }: { user: { style?: NickStyle | null }; text: string }) {
  const st = user.style;
  if (!st) return <>{text}</>;
  return (
    <span className="nick">
      <span
        className={st.fire ? 'nick-fire' : st.grad ? `nick-grad nick-grad-${st.grad}` : st.dev && !st.color ? 'nick-grad nick-grad-dev' : undefined}
        style={st.color && !st.fire && !st.grad ? { color: st.color } : undefined}
      >
        {text}
      </span>
      {st.emoji ? <span className="nick-emoji"> {st.emoji}</span> : null}
      {st.dev ? (
        <span className="dev-badge" title="Разработчик приложения">
          {'</>'} DEV
        </span>
      ) : null}
    </span>
  );
}

export function Jersey({ n }: { n: number | null | undefined }) {
  return <span className="jersey">{n ?? '–'}</span>;
}

export function Spinner() {
  return (
    <div className="loading">
      <div className="spinner" />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ic">{icon}</div>
      <b style={{ color: 'var(--ink)' }}>{title}</b>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, ReactNode][] }) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button
          key={v}
          className={v === value ? 'on' : ''}
          onClick={() => {
            haptic.select();
            onChange(v);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="sheet-grip" />
        {title && (
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label={t('Закрыть')}>
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export async function copyText(text: string, label = t('Скопировано')) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(label);
}

export function CopyRow({ label, value, copy }: { label: string; value: ReactNode; copy: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="copy-row"
      onClick={() => {
        void copyText(copy, t('{0}: скопировано', label));
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <div className="grow">
        <div className="lbl">{label}</div>
        <div className="val">{value}</div>
      </div>
      {done ? <Check size={18} color="var(--ok)" /> : <Copy size={18} color="var(--falcon)" />}
    </button>
  );
}

/** Выбор скрина оплаты с превью. */
export function FilePick({ file, onChange, label = t('Прикрепить скрин оплаты') }: { file: File | null; onChange: (f: File | null) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className={`drop ${file ? 'has' : ''}`} onClick={() => ref.current?.click()}>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file ? (
        preview ? (
          <img src={preview} alt={t('Скрин')} />
        ) : (
          <div style={{ padding: 12 }}>📄 {file.name}</div>
        )
      ) : (
        <>
          <ImagePlus size={28} color="var(--falcon)" />
          <b style={{ color: 'var(--ink)' }}>{label}</b>
          <span className="small">{t('Скриншот перевода из банка')}</span>
        </>
      )}
    </div>
  );
}

/** Картинка из защищённого /api/files. */
export function ProofImage({ name }: { name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    fetchFileUrl(name)
      .then((x) => setUrl((u = x)))
      .catch(() => setErr(true));
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [name]);
  if (err) return <div className="muted small">{t('Не удалось загрузить скрин')}</div>;
  if (!url) return <div className="proof-img skeleton" />;
  if (name.endsWith('.pdf'))
    return (
      <a className="btn secondary block" href={url} target="_blank" rel="noreferrer">
        {t('Открыть PDF')}
      </a>
    );
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img className="proof-img" src={url} alt={t('Скрин оплаты')} />
    </a>
  );
}

export function SquadChip({ squad, full }: { squad: Pick<Squad, 'short' | 'name' | 'color'>; full?: boolean }) {
  return (
    <span className="chip" style={{ background: `${squad.color}22`, color: squad.color }}>
      {full ? squad.name : squad.short}
    </span>
  );
}

/** Теги человека: составы клуба цветом состава и команда гостя. compact — маленькие, для пятёрок. */
export function UserTags({ user, compact }: { user: { tags?: { label: string; color: string; guest?: boolean }[] }; compact?: boolean }) {
  if (!user.tags?.length) return null;
  return (
    <span className={`utags ${compact ? 'compact' : ''}`}>
      {user.tags.map((tg) => (
        <span key={tg.label} className={`utag ${tg.guest ? 'guest' : ''}`} style={{ background: `${tg.color}22`, color: tg.color }} title={tg.guest ? `Гость · ${tg.label}` : tg.label}>
          {tg.guest && tg.label !== 'Гость' ? `↗ ${tg.label}` : tg.label}
        </span>
      ))}
    </span>
  );
}

/** Выбор нескольких составов чипами. */
export function SquadPicker({ squads, value, onChange }: { squads: Squad[]; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="chips">
      {squads.map((s) => {
        const on = value.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            className="chip"
            style={{ border: 0, height: 34, padding: '0 14px', background: on ? s.color : 'var(--surface-2)', color: on ? '#fff' : 'var(--ink-2)' }}
            onClick={() => onChange(on ? value.filter((x) => x !== s.id) : [...value, s.id])}
          >
            {s.name}
            {s.division ? t(' · {0} див.', s.division) : ''}
          </button>
        );
      })}
    </div>
  );
}
