import { t } from './i18n';
import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { api } from './api';
import { Avatar, toast, toastErr } from './ui';

/** Обрезаем по центру в квадрат 512×512 и жмём в JPEG — фото с телефона весят мегабайты. */
async function squareJpeg(file: File, size = 512): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error(t('Не получилось открыть картинку — попробуй jpg или png')));
      i.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d')!.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error(t('Не удалось сжать фото')))), 'image/jpeg', 0.86));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Фото игрока: своё (endpoint /api/me/photo) или от админа (/api/admin/users/:id/photo).
 * Без своего фото показывается аватарка из Telegram или инициалы.
 */
export function PhotoEdit({
  user,
  endpoint,
  onChange,
}: {
  user: { id: number; first_name: string; last_name?: string | null; photo_url?: string | null };
  endpoint: string;
  onChange: () => Promise<unknown> | void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const custom = !!user.photo_url?.startsWith('/api/avatars/');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', await squareJpeg(file), 'photo.jpg');
      await api.post(endpoint, fd);
      await onChange();
      toast(t('Фото обновлено'));
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.del(endpoint);
      await onChange();
      toast(t('Фото убрано'));
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="photo-edit">
      <button type="button" className="photo-edit-av" onClick={() => input.current?.click()} disabled={busy} aria-label={t('Сменить фото')}>
        <Avatar user={user} size="lg" />
        <span className="photo-edit-cam">
          <Camera size={14} />
        </span>
      </button>
      <div className="vstack" style={{ gap: 6, alignItems: 'flex-start' }}>
        <button type="button" className="btn secondary sm" disabled={busy} onClick={() => input.current?.click()}>
          <Camera size={16} /> {busy ? t('Загружаем…') : user.photo_url ? t('Сменить фото') : t('Поставить фото')}
        </button>
        {custom && (
          <button type="button" className="btn ghost sm" disabled={busy} onClick={remove}>
            <Trash2 size={16} /> {t('Убрать')}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
