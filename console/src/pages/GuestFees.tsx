import { useState } from 'react';
import { Check, Eye, X } from 'lucide-react';
import { api, type PublicUser } from '@shared/api';
import { fmt } from '@shared/format';
import { ProofImage, Segmented, Spinner, useAction, useApi, useMe } from '@shared/ui';
import Drawer from '../Drawer';

type Fee = {
  id: number;
  amount: number;
  status: 'unpaid' | 'pending' | 'paid';
  proof: string | null;
  created_at: string;
  event: { id: number; type: string; title: string | null; starts_at: string };
  user: PublicUser;
};

/** Гости платят за каждый выход на лёд: проверка скринов и кто не оплатил. */
export default function GuestFees() {
  const { refresh } = useMe();
  const { data, loading, reload } = useApi<Fee[]>('/api/admin/fees');
  const [tab, setTab] = useState<'pending' | 'unpaid' | 'paid'>('pending');
  const [proof, setProof] = useState<Fee | null>(null);
  const { busy, run } = useAction();
  const all = data ?? [];
  const n = (s: Fee['status']) => all.filter((f) => f.status === s).length;
  const rows = all.filter((f) => f.status === tab);
  const patch = (f: Fee, status: 'paid' | 'unpaid', ok: string) =>
    run(async () => {
      await api.patch(`/api/admin/fees/${f.id}`, { status });
      setProof(null);
      await Promise.all([reload(), refresh()]);
    }, ok);

  return (
    <div className="cpage">
      <div className="c-head">
        <div>
          <h1>Оплаты гостей</h1>
          <div className="sub">Гость платит за каждый выход на лёд · долг: {fmt.gel(all.filter((f) => f.status === 'unpaid').reduce((a, f) => a + f.amount, 0))}</div>
        </div>
      </div>
      <div className="c-bar">
        <div style={{ width: 460 }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              ['pending', `Проверить${n('pending') ? ` · ${n('pending')}` : ''}`],
              ['unpaid', `Не оплатили${n('unpaid') ? ` · ${n('unpaid')}` : ''}`],
              ['paid', 'Оплачено'],
            ]}
          />
        </div>
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Гость</th>
                <th>Событие</th>
                <th>Сумма</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td>
                    <b>{f.user.name}</b>
                  </td>
                  <td className="muted">
                    {f.event.type === 'game' ? 'Игра' : 'Тренировка'}
                    {f.event.title ? ` · ${f.event.title}` : ''} · {fmt.dateShort(f.event.starts_at)}, {fmt.time(f.event.starts_at)}
                  </td>
                  <td className="num">
                    <b>{fmt.gel(f.amount)}</b>
                  </td>
                  <td>
                    <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      {f.proof && (
                        <button className="btn ghost xs" onClick={() => setProof(f)}>
                          <Eye size={14} /> Скрин
                        </button>
                      )}
                      {f.status !== 'paid' && (
                        <button className="btn ok xs" disabled={busy} onClick={() => patch(f, 'paid', 'Оплата принята')}>
                          <Check size={14} /> {f.status === 'pending' ? 'Деньги пришли' : 'Получил'}
                        </button>
                      )}
                      {f.status === 'pending' && (
                        <button className="btn bad-soft xs" disabled={busy} onClick={() => patch(f, 'unpaid', 'Гостю написал')}>
                          <X size={14} /> Не пришли
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={4} className="muted center" style={{ padding: 24 }}>
                    {tab === 'pending' ? 'Нечего проверять 🎉' : tab === 'unpaid' ? 'Все гости оплатили 👌' : 'Пока пусто'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <Drawer open={!!proof} onClose={() => setProof(null)} title={proof ? `${proof.user.name} · ${fmt.gel(proof.amount)}` : ''}>
        {proof?.proof && <ProofImage name={proof.proof} />}
      </Drawer>
    </div>
  );
}
