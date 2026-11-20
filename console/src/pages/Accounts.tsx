import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Plus } from 'lucide-react';
import { api, type Account, type FinanceData } from '@shared/api';
import { fmt } from '@shared/format';
import { copyText, Segmented, Spinner, useAction, useApi } from '@shared/ui';
import Drawer from '../Drawer';

const EMPTY = { bank: 'TBC', holder: '', iban: '', purpose: 'dues' as Account['purpose'], pay_url: '', note: '', sort: 0 };
const BANK = (b: string) => (['TBC', 'BOG', 'Liberty'].includes(b) ? b : 'other');

export default function Accounts() {
  const { data, loading, reload } = useApi<Account[]>('/api/accounts');
  const fin = useApi<FinanceData>('/api/finance');
  const [edit, setEdit] = useState<(typeof EMPTY & { id?: number }) | null>(null);
  const [price, setPrice] = useState('');
  const { busy, run } = useAction();
  useEffect(() => {
    if (fin.data) setPrice(String(fin.data.sharpeningPrice));
  }, [fin.data]);
  if (loading) return <Spinner />;

  return (
    <div className="cpage">
      <div className="c-head">
        <div>
          <h1>Счета</h1>
          <div className="sub">Игроки видят эти реквизиты при оплате и копируют их одним тапом</div>
        </div>
        <button className="btn" onClick={() => setEdit({ ...EMPTY })}>
          <Plus size={18} /> Счёт
        </button>
      </div>
      {(['dues', 'sharpening'] as const).map((purpose) => (
        <div key={purpose} style={{ marginBottom: 20 }}>
          <div className="section-title" style={{ margin: '0 0 10px' }}>
            {purpose === 'dues' ? 'Для взносов' : 'Для заточки'}
          </div>
          <div className="c-grid three">
            {(data ?? [])
              .filter((a) => a.purpose === purpose)
              .map((a) => (
                <div key={a.id} className={`bank-card ${BANK(a.bank)}`} style={{ cursor: 'pointer' }} onClick={() => setEdit({ ...a, pay_url: a.pay_url ?? '', note: a.note ?? '' })}>
                  <div className="bk">
                    <span>{a.bank}</span>
                    <span>GEL</span>
                  </div>
                  <div className="ib">{fmt.iban(a.iban)}</div>
                  <div className="hd">{a.holder}</div>
                  {a.note && <div className="hd" style={{ opacity: 0.75, fontSize: 12 }}>{a.note}</div>}
                  <div className="actions" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => copyText(a.iban, 'IBAN скопирован')}>
                      <Copy size={14} /> IBAN
                    </button>
                    {a.pay_url && (
                      <a href={a.pay_url} target="_blank" rel="noreferrer">
                        <ExternalLink size={14} /> Ссылка
                      </a>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
      <div className="c-card pad" style={{ maxWidth: 420 }}>
        <h3>Цена заточки</h3>
        <div className="hstack">
          <input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
          <button className="btn secondary" disabled={busy || !price} onClick={() => run(() => api.put('/api/admin/settings', { sharpening_price: Number(price) }), 'Цена обновлена')}>
            Сохранить
          </button>
        </div>
      </div>

      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Счёт' : 'Новый счёт'}>
        {edit && (
          <>
            <Segmented
              value={['TBC', 'BOG', 'Liberty'].includes(edit.bank) ? edit.bank : 'other'}
              onChange={(v) => setEdit({ ...edit, bank: v === 'other' ? '' : v })}
              options={[['TBC', 'TBC'], ['BOG', 'BOG'], ['Liberty', 'Liberty'], ['other', 'Другой']]}
            />
            {!['TBC', 'BOG', 'Liberty'].includes(edit.bank) && <input className="input" placeholder="Название банка" value={edit.bank} onChange={(e) => setEdit({ ...edit, bank: e.target.value })} />}
            <label className="field">
              <span>Получатель</span>
              <input className="input" value={edit.holder} onChange={(e) => setEdit({ ...edit, holder: e.target.value })} />
            </label>
            <label className="field">
              <span>IBAN</span>
              <input className="input" value={edit.iban} placeholder="GE00TB0000000000000000" onChange={(e) => setEdit({ ...edit, iban: e.target.value.toUpperCase() })} />
            </label>
            <label className="field">
              <span>Ссылка на оплату (необязательно)</span>
              <input className="input" value={edit.pay_url} placeholder="https://…" onChange={(e) => setEdit({ ...edit, pay_url: e.target.value })} />
            </label>
            <label className="field">
              <span>Подпись</span>
              <input className="input" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
            </label>
            <div className="field">
              <span>Для чего</span>
              <Segmented value={edit.purpose} onChange={(v) => setEdit({ ...edit, purpose: v })} options={[['dues', 'Взносы'], ['sharpening', 'Заточка']]} />
            </div>
            <button
              className="btn block"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (edit.id) await api.put(`/api/admin/accounts/${edit.id}`, edit);
                  else await api.post('/api/admin/accounts', edit);
                  await reload();
                  setEdit(null);
                }, 'Сохранено')
              }
            >
              Сохранить
            </button>
            {edit.id && (
              <button
                className="btn bad-soft block"
                disabled={busy}
                onClick={() =>
                  confirm('Удалить счёт?') &&
                  run(async () => {
                    await api.del(`/api/admin/accounts/${edit.id}`);
                    await reload();
                    setEdit(null);
                  }, 'Удалено')
                }
              >
                Удалить
              </button>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
