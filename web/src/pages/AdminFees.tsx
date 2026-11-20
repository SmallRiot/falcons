import { t } from '@shared/i18n';
import { useState } from 'react';
import { Check, Ticket, X } from 'lucide-react';
import { api, type PublicUser } from '@shared/api';
import { fmt } from '@shared/format';
import { Avatar, Empty, ProofImage, Segmented, Spinner, useAction, useApi, useMe } from '@shared/ui';

type Fee = {
  id: number;
  amount: number;
  status: 'unpaid' | 'pending' | 'paid';
  proof: string | null;
  comment: string | null;
  created_at: string;
  event: { id: number; type: string; title: string | null; starts_at: string };
  user: PublicUser;
};

const evLabel = (e: Fee['event']) =>
  `${e.type === 'game' ? t('Игра') : t('Тренировка')}${e.title ? ` · ${e.title}` : ''} · ${fmt.dateShort(e.starts_at)}, ${fmt.time(e.starts_at)}`;

/** Гости платят за каждый выход: проверка скринов, кто не оплатил, история. */
export default function AdminFees() {
  const { refresh } = useMe();
  const { data, loading, reload } = useApi<Fee[]>('/api/admin/fees');
  const [tab, setTab] = useState<'pending' | 'unpaid' | 'paid'>('pending');
  const { busy, run } = useAction();
  const all = data ?? [];
  const list = all.filter((f) => f.status === tab);
  const count = (s: Fee['status']) => all.filter((f) => f.status === s).length;
  const patch = (f: Fee, status: 'paid' | 'unpaid', ok: string) =>
    run(async () => {
      await api.patch(`/api/admin/fees/${f.id}`, { status });
      await Promise.all([reload(), refresh()]);
    }, ok);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('Оплаты гостей')}</h1>
          <div className="sub">{t('Гость платит за каждый выход на лёд')}</div>
        </div>
      </div>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ['pending', t('Проверить{0}', count('pending') ? ` · ${count('pending')}` : '')],
          ['unpaid', t('Не оплатили{0}', count('unpaid') ? ` · ${count('unpaid')}` : '')],
          ['paid', t('Оплачено')],
        ]}
      />
      {loading ? (
        <Spinner />
      ) : !list.length ? (
        <Empty icon={<Ticket size={26} />} title={tab === 'pending' ? t('Нечего проверять 🎉') : tab === 'unpaid' ? t('Все гости оплатили 👌') : t('Пока пусто')} />
      ) : (
        <div className="vstack">
          {list.map((f) => (
            <div key={f.id} className="card vstack">
              <div className="hstack">
                <Avatar user={f.user} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{f.user.name}</b>
                  <div className="muted small">{evLabel(f.event)}</div>
                </div>
                <b className="num">{fmt.gel(f.amount)}</b>
              </div>
              {f.status === 'pending' && (
                <>
                  {f.proof && <ProofImage name={f.proof} />}
                  <div className="btn-row">
                    <button className="btn bad-soft" disabled={busy} onClick={() => patch(f, 'unpaid', t('Гостю написал, что оплату не нашли'))}>
                      <X size={18} /> {t('Не пришли')}
                    </button>
                    <button className="btn ok" disabled={busy} onClick={() => patch(f, 'paid', t('Оплата принята'))}>
                      <Check size={18} /> {t('Деньги пришли')}
                    </button>
                  </div>
                </>
              )}
              {f.status === 'unpaid' && (
                <button className="btn ok-soft block" disabled={busy} onClick={() => patch(f, 'paid', t('Отмечено оплаченным'))}>
                  <Check size={18} /> {t('Получил')} {fmt.gel(f.amount)} {t('(наличные и т.п.)')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
