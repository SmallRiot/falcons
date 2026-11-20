import { useEffect, useState } from 'react';
import { Copy, Plus } from 'lucide-react';
import { api, type Account, type FinanceData } from '@shared/api';
import { bankFromIban, validIban, fmt } from '@shared/format';
import { ask, copyText, Segmented, Spinner, useAction, useApi } from '@shared/ui';
import Drawer from '../Drawer';

const EMPTY = { bank: 'TBC', holder: '', iban: '', purpose: 'dues' as Account['purpose'], pay_url: '', note: '', sort: 0 };
const BANK = (b: string) => (['TBC', 'BOG', 'Liberty'].includes(b) ? b : 'other');

export default function Accounts() {
  const { data, loading, reload } = useApi<Account[]>('/api/accounts');
  const fin = useApi<FinanceData>('/api/finance');
  const [edit, setEdit] = useState<(typeof EMPTY & { id?: number }) | null>(null);
  const [price, setPrice] = useState('');
  const [cardUrl, setCardUrl] = useState('');
  const { busy, run } = useAction();
  useEffect(() => {
    if (fin.data) {
      setPrice(String(fin.data.sharpeningPrice));
      setCardUrl(fin.data.cardPayUrl ?? '');
    }
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
                <div key={a.id} className={`bank-card ${BANK(bankFromIban(a.iban).code)}`} style={{ cursor: 'pointer' }} onClick={() => setEdit({ ...a, pay_url: a.pay_url ?? '', note: a.note ?? '' })}>
                  <div className="bk">
                    <span className="hstack" style={{ gap: 8 }}>
                      {['TBC', 'BOG'].includes(bankFromIban(a.iban).code) && (
                        <img className="bank-logo" src={`/banks/${bankFromIban(a.iban).code.toLowerCase()}.svg`} alt="" />
                      )}
                      {bankFromIban(a.iban).name}
                    </span>
                    <span>GEL</span>
                  </div>
                  <div className="ib">{fmt.iban(a.iban)}</div>
                  <div className="hd">{a.holder}</div>
                  <div className="actions" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => copyText(a.iban, 'IBAN скопирован')}>
                      <Copy size={14} /> IBAN
                    </button>
                    <button onClick={() => copyText(a.holder, 'ФИО скопировано')}>
                      <Copy size={14} /> ФИО
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
      <div className="c-card pad" style={{ maxWidth: 520, marginBottom: 14 }}>
        <h3>Оплата взноса картой по ссылке</h3>
        <div className="muted small" style={{ marginBottom: 8 }}>Кнопка у игроков — последней, под счетами. Пусто — кнопки нет.</div>
        <div className="hstack">
          <input className="input" value={cardUrl} placeholder="https://egreve.bog.ge/…" onChange={(e) => setCardUrl(e.target.value)} />
          <button className="btn secondary" disabled={busy} onClick={() => run(() => api.put('/api/admin/settings', { dues_card_url: cardUrl }), 'Ссылка сохранена')}>
            Сохранить
          </button>
        </div>
      </div>
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
            <label className="field">
              <span>ФИО получателя</span>
              <input className="input" value={edit.holder} placeholder="Как в банке, латиницей: IVAN PETROV" onChange={(e) => setEdit({ ...edit, holder: e.target.value })} />
            </label>
            <label className="field">
              <span>IBAN</span>
              <input className="input" value={edit.iban} placeholder="GE29TB7000000000000000" onChange={(e) => setEdit({ ...edit, iban: e.target.value.toUpperCase().replace(/\s+/g, '') })} />
            </label>
            {edit.iban && (
              <span className="small" style={{ color: validIban(edit.iban) ? 'var(--ok)' : 'var(--warn)', marginTop: -6 }}>
                {validIban(edit.iban) ? `✓ ${bankFromIban(edit.iban).name}` : 'IBAN: GE + 2 цифры + 2 буквы банка + 16 цифр'}
              </span>
            )}
            <div className="field">
              <span>Для чего</span>
              <Segmented value={edit.purpose} onChange={(v) => setEdit({ ...edit, purpose: v })} options={[['dues', 'Взносы'], ['sharpening', 'Заточка']]} />
            </div>
            <button
              className="btn block"
              disabled={busy || !edit.holder.trim() || !validIban(edit.iban)}
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
                onClick={async () =>
                  await ask('Удалить счёт?') &&
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
