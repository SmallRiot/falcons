import { t } from '@shared/i18n';
import { bankFromIban, validIban } from '@shared/format';
import { useEffect, useState } from 'react';
import { Landmark, Pencil, Plus } from 'lucide-react';
import { api, type Account, type FinanceData } from '@shared/api';
import { ask, Empty, Segmented, Sheet, Spinner, useAction, useApi } from '@shared/ui';
import { BankCard } from './PaySheet';

const EMPTY = { bank: 'TBC', holder: '', iban: '', purpose: 'dues' as Account['purpose'], pay_url: '', note: '', sort: 0 };

export default function AdminAccounts() {
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
  const groups: [Account['purpose'], string][] = [
    ['dues', t('Для взносов')],
    ['sharpening', t('Для заточки')],
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('Счета')}</h1>
        <button className="btn sm" onClick={() => setEdit({ ...EMPTY })}>
          <Plus size={16} /> {t('Счёт')}
        </button>
      </div>
      <div className="alert info">
        <div className="body small">
          {t('Игроки увидят эти карточки при оплате и смогут скопировать IBAN или все реквизиты одним тапом. Если в банке есть платёжная ссылка или QR-страница (например, у TBC), вставь её в поле «Ссылка на оплату» — появится кнопка «Оплатить в банке».')}
        </div>
      </div>
      {groups.map(([purpose, label]) => {
        const list = (data ?? []).filter((a) => a.purpose === purpose);
        return (
          <div key={purpose} className="vstack">
            <div className="section-title">{label}</div>
            {list.length ? (
              list.map((a) => (
                <div key={a.id} style={{ position: 'relative' }}>
                  <BankCard acc={a} />
                  <button
                    className="icon-btn"
                    style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(255,255,255,0.25)', color: '#fff' }}
                    onClick={() => setEdit({ ...a, pay_url: a.pay_url ?? '', note: a.note ?? '' })}
                    aria-label={t('Изменить')}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              ))
            ) : (
              <Empty icon={<Landmark size={26} />} title={t('Нет счетов')} />
            )}
          </div>
        );
      })}

      <div className="section-title">{t('Оплата взноса картой по ссылке')}</div>
      <div className="card vstack" style={{ gap: 8 }}>
        <input className="input" value={cardUrl} placeholder="https://egreve.bog.ge/…" onChange={(e) => setCardUrl(e.target.value)} />
        <div className="muted small">{t('Кнопка «Оплатить картой по ссылке» — последней, под счетами. Пусто — кнопки нет.')}</div>
        <button className="btn secondary" disabled={busy} onClick={() => run(() => api.put('/api/admin/settings', { dues_card_url: cardUrl }), t('Ссылка сохранена'))}>
          {t('Сохранить')}
        </button>
      </div>

      <div className="section-title">{t('Цена заточки')}</div>
      <div className="card hstack">
        <input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
        <button
          className="btn secondary"
          disabled={busy || !price}
          onClick={() => run(() => api.put('/api/admin/settings', { sharpening_price: Number(price) }), t('Цена обновлена'))}
        >
          {t('Сохранить')}
        </button>
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('Счёт') : t('Новый счёт')}>
        {edit && (
          <div className="form">
            <label className="field">
              <span>{t('ФИО получателя')}</span>
              <input className="input" value={edit.holder} placeholder={t('Как в банке, латиницей: IVAN PETROV')} onChange={(e) => setEdit({ ...edit, holder: e.target.value })} />
            </label>
            <label className="field">
              <span>IBAN</span>
              <input className="input" value={edit.iban} placeholder="GE29TB7000000000000000" onChange={(e) => setEdit({ ...edit, iban: e.target.value.toUpperCase().replace(/\s+/g, '') })} />
            </label>
            {edit.iban && (
              <span className="small" style={{ color: validIban(edit.iban) ? 'var(--ok)' : 'var(--warn)', marginTop: -6 }}>
                {validIban(edit.iban) ? `✓ ${bankFromIban(edit.iban).name}` : t('IBAN: GE + 2 цифры + 2 буквы банка + 16 цифр')}
              </span>
            )}
            <div className="field">
              <span>{t('Для чего')}</span>
              <Segmented
                value={edit.purpose}
                onChange={(v) => setEdit({ ...edit, purpose: v })}
                options={[
                  ['dues', t('Взносы')],
                  ['sharpening', t('Заточка')],
                ]}
              />
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
                }, t('Сохранено'))
              }
            >
              {t('Сохранить')}
            </button>
            {edit.id && (
              <button
                className="btn bad-soft block"
                disabled={busy}
                onClick={async () =>
                  await ask(t('Удалить счёт?')) &&
                  run(async () => {
                    await api.del(`/api/admin/accounts/${edit.id}`);
                    await reload();
                    setEdit(null);
                  }, t('Удалено'))
                }
              >
                {t('Удалить')}
              </button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
