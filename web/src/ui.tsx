import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, ImagePlus, X } from 'lucide-react';
import { api, fetchFileUrl, type Me } from './api';
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

export function Toaster() {
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

export function Avatar({ user, size }: { user: { id: number; first_name: string; last_name?: string | null; photo_url?: string | null }; size?: 'sm' | 'lg' }) {
  const initials = ((user.first_name?.[0] ?? '') + (user.last_name?.[0] ?? '')).toUpperCase() || '?';
  return (
    <span className={`avatar ${size ?? ''}`} style={{ background: AVATAR_COLORS[Math.abs(user.id) % AVATAR_COLORS.length] }}>
      {user.photo_url ? <img src={user.photo_url} alt="" loading="lazy" /> : initials}
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
            <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
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

export async function copyText(text: string, label = 'Скопировано') {
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
        void copyText(copy, `${label}: скопировано`);
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
export function FilePick({ file, onChange, label = 'Прикрепить скрин оплаты' }: { file: File | null; onChange: (f: File | null) => void; label?: string }) {
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
          <img src={preview} alt="Скрин" />
        ) : (
          <div style={{ padding: 12 }}>📄 {file.name}</div>
        )
      ) : (
        <>
          <ImagePlus size={28} color="var(--falcon)" />
          <b style={{ color: 'var(--ink)' }}>{label}</b>
          <span className="small">Скриншот перевода из банка</span>
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
  if (err) return <div className="muted small">Не удалось загрузить скрин</div>;
  if (!url) return <div className="proof-img skeleton" />;
  if (name.endsWith('.pdf'))
    return (
      <a className="btn secondary block" href={url} target="_blank" rel="noreferrer">
        Открыть PDF
      </a>
    );
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img className="proof-img" src={url} alt="Скрин оплаты" />
    </a>
  );
}
