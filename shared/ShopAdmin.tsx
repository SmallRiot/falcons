import { useState } from 'react';
import { api } from './api';
import { Spinner, toast, toastErr, useApi } from './ui';

type Row = { id: string; name: string; price: number; basePrice: number; weekPrice?: number; baseWeekPrice?: number; hidden: boolean; off: boolean; kind: string };

/**
 * Владелец управляет магазином ачивок: цена, скрытая цена («???» на витрине), в продаже или снята.
 * Снять с продажи = ротация: ачивка пропадает с витрины, у купивших всё действует до конца срока.
 */
export function ShopAdmin() {
  const { data, loading, setData } = useApi<Row[]>('/api/admin/shop');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  if (loading || !data) return <Spinner />;
  const save = async (r: Row, patch: Partial<Pick<Row, 'price' | 'weekPrice' | 'hidden' | 'off'>>, ok: string) => {
    setBusy(r.id);
    try {
      setData(await api.put<Row[]>(`/api/admin/shop/${r.id}`, patch));
      setDraft((d) => ({ ...d, [r.id]: '', [`${r.id}:w`]: '' }));
      toast(ok);
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="shop-admin">
      <div className="muted small">Цены и состав витрины видишь и меняешь только ты. «Снять» — ачивка уходит с витрины (ротация), у купивших всё действует до конца срока.</div>
      {data.map((r) => (
        <div key={r.id} className={`card tight shop-admin-row ${r.off ? 'off' : ''}`}>
          <div className="between">
            <div>
              <b>{r.name}</b>
              <div className="muted small">
                {r.kind === 'cosmetic' ? 'ачивка' : r.kind === 'shout' ? 'респект' : r.kind === 'voucher' ? 'ваучер' : 'экипировка'}
                {r.price !== r.basePrice ? ` · было ${r.basePrice}` : ''}
                {r.weekPrice != null ? ` · неделя ${r.weekPrice} · месяц ${r.price}` : ''}
              </div>
            </div>
            <span className={`chip ${r.off ? 'bad' : 'ok'}`}>{r.off ? 'снята' : 'в продаже'}</span>
          </div>
          <div className="hstack" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ width: 110, height: 38 }}
              inputMode="numeric"
              placeholder={r.weekPrice != null ? `месяц ${r.price}` : String(r.price)}
              value={draft[r.id] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value.replace(/\D/g, '') }))}
            />
            <button
              className="btn sm secondary"
              disabled={busy === r.id || !draft[r.id] || Number(draft[r.id]) === r.price}
              onClick={() => save(r, { price: Number(draft[r.id]) }, `Цена: ${draft[r.id]} очк.`)}
            >
              {r.weekPrice != null ? 'Месяц' : 'Цена'}
            </button>
            {r.weekPrice != null && (
              <>
                <input
                  className="input"
                  style={{ width: 110, height: 38 }}
                  inputMode="numeric"
                  placeholder={`неделя ${r.weekPrice}`}
                  value={draft[`${r.id}:w`] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [`${r.id}:w`]: e.target.value.replace(/\D/g, '') }))}
                />
                <button
                  className="btn sm secondary"
                  disabled={busy === r.id || !draft[`${r.id}:w`] || Number(draft[`${r.id}:w`]) === r.weekPrice}
                  onClick={() => save(r, { weekPrice: Number(draft[`${r.id}:w`]) }, `Неделя: ${draft[`${r.id}:w`]} очк.`)}
                >
                  Неделя
                </button>
              </>
            )}
            <button className="btn sm ghost" disabled={busy === r.id} onClick={() => save(r, { hidden: !r.hidden }, r.hidden ? 'Цена теперь видна' : 'Цена скрыта — «???»')}>
              {r.hidden ? '👁 Показать цену' : '🙈 Скрыть цену'}
            </button>
            <button className={`btn sm ${r.off ? 'ok' : 'bad-soft'}`} disabled={busy === r.id} onClick={() => save(r, { off: !r.off }, r.off ? 'Снова в продаже' : 'Снято с витрины')}>
              {r.off ? 'Вернуть' : 'Снять'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
