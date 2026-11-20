import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { api } from './api';
import { toast, toastErr } from './ui';

/** Обрезаем по центру в 3:1 и жмём до 1200×400 JPEG. */
async function wideJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('Не получилось открыть картинку — попробуй jpg или png'));
      i.src = url;
    });
    const W = 1200, H = 400;
    const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const sw = W / k, sh = H / k;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    c.getContext('2d')!.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, W, H);
    return await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('Не удалось сжать картинку'))), 'image/jpeg', 0.86));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Загрузка обложки профиля (доступна, пока действует ачивка «Обложка профиля»). */
export function CoverEdit({ onDone, label = 'Загрузить обложку' }: { onDone: () => Promise<unknown> | void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', await wideJpeg(f), 'cover.jpg');
      await api.post('/api/me/cover', fd);
      await onDone();
      toast('Обложка стоит! 🔥');
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <>
      <button type="button" className="btn block" disabled={busy} onClick={() => input.current?.click()}>
        <ImagePlus size={18} /> {busy ? 'Загружаем…' : label}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </>
  );
}
