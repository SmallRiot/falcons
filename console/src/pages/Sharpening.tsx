import { useMemo, useState } from 'react';
import { Eye, Plus } from 'lucide-react';
import { api, type PublicUser } from '@shared/api';
import { fmt } from '@shared/format';
import { Avatar, Jersey, ProofImage, Segmented, Spinner, useAction, useApi, useMe } from '@shared/ui';
import Drawer from '../Drawer';

interface Item {
  id: number;
  note: string | null;
  proof: string | null;
  status: 'new' | 'accepted' | 'done' | 'rejected';
  payment: 'unpaid' | 'pending' | 'paid';
  price: number;
  comment: string | null;
  created_at: string;
  user: PublicUser;
}
const STATUS: Record<Item['status'], [string, string]> = { new: ['Новая', 'info'], accepted: ['В работе', 'warn'], done: ['Готово', 'ok'], rejected: ['Отклонена', 'bad'] };
const PAY: Record<Item['payment'], [string, string]> = { unpaid: ['Долг', 'bad'], pending: ['Скрин на проверке', 'info'], paid: ['Оплачено', 'ok'] };

export default function SharpeningQueue() {
  const { refresh } = useMe();
  const [scope, setScope] = useState<'active' | 'debts' | 'all'>('active');
  const { data, loading, reload } = useApi<Item[]>(`/api/service/sharpening${scope === 'all' ? '?all=1' : ''}`, [scope === 'all']);
  const [open, setOpen] = useState<Item | null>(null);
  const [debtOpen, setDebtOpen] = useState(false);
  const { busy, run } = useAction();
  const isDebt = (s: Item) => s.payment === 'unpaid' && s.status !== 'rejected';
  const rows = (data ?? []).filter((s) => (scope === 'debts' ? isDebt(s) : scope === 'active' ? !isDebt(s) : true));
  const patch = (s: Item, body: Record<string, string>, ok: string) =>
    run(async () => {
      await api.patch(`/api/service/sharpening/${s.id}`, body);
      setOpen(null);
      await Promise.all([reload(), refresh()]);
    }, ok);

  return (
    <div className="cpage">
      <div className="c-head">
        <div>
          <h1>Заточка</h1>
          <div className="sub">Очередь заявок и долги за заточку · игрок получает пуш на каждый шаг</div>
        </div>
        <button className="btn bad-soft" onClick={() => setDebtOpen(true)}>
          <Plus size={18} /> Записать долг
        </button>
      </div>
      <div className="c-bar">
        <div style={{ width: 360 }}>
          <Segmented value={scope} onChange={setScope} options={[['active', 'Очередь'], ['debts', 'Должники'], ['all', 'Все']]} />
        </div>
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th className="sticky-col">Игрок</th>
                <th>Когда</th>
                <th>Комментарий</th>
                <th className="num">Сумма</th>
                <th>Оплата</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="muted">{s.id}</td>
                  <td className="sticky-col">
                    <div className="player">{s.user.name}</div>
                  </td>
                  <td>{fmt.dateShort(s.created_at)}, {fmt.time(s.created_at)}</td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.note ?? <span className="muted">—</span>}</td>
                  <td className="num">{fmt.gel(s.price)}</td>
                  <td>
                    <span className={`chip ${PAY[s.payment][1]}`}>{PAY[s.payment][0]}</span>
                  </td>
                  <td>{isDebt(s) ? <span className="muted">—</span> : <span className={`chip ${STATUS[s.status][1]}`}>{STATUS[s.status][0]}</span>}</td>
                  <td>
                    <div className="hstack" style={{ justifyContent: 'flex-end' }}>
                      {s.proof && (
                        <button className="btn ghost xs" onClick={() => setOpen(s)}>
                          <Eye size={14} /> Скрин
                        </button>
                      )}
                      {s.payment === 'pending' && s.status === 'new' && (
                        <button className="btn xs" disabled={busy} onClick={() => patch(s, { status: 'accepted' }, 'Взято в работу')}>
                          Оплата ок, беру
                        </button>
                      )}
                      {s.payment === 'pending' && (
                        <button className="btn bad-soft xs" disabled={busy} onClick={() => patch(s, { payment: 'unpaid' }, 'Записан долг')}>
                          Оплаты нет
                        </button>
                      )}
                      {s.status === 'accepted' && (
                        <button className="btn ok xs" disabled={busy} onClick={() => patch(s, { status: 'done' }, 'Готово — игрок получил пуш')}>
                          Готово
                        </button>
                      )}
                      {s.payment === 'unpaid' && (
                        <button className="btn ok-soft xs" disabled={busy} onClick={() => patch(s, { payment: 'paid' }, 'Долг закрыт')}>
                          Получил деньги
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="muted center" style={{ padding: 32 }}>{scope === 'debts' ? 'Должников нет 🎉' : 'Пусто'}</div>}
        </div>
      )}
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `Заточка #${open.id} · ${open.user.name}` : ''}>
        {open?.proof && <ProofImage name={open.proof} />}
      </Drawer>
      <AddDebt open={debtOpen} onClose={() => setDebtOpen(false)} onDone={async () => { setScope('debts'); await Promise.all([reload(), refresh()]); }} />
    </div>
  );
}

function AddDebt({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const roster = useApi<PublicUser[]>(open ? '/api/roster' : null, [open]);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<PublicUser | null>(null);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const { busy, run } = useAction();
  const list = useMemo(() => (roster.data ?? []).filter((u) => !q || `${u.name} ${u.number ?? ''}`.toLowerCase().includes(q.toLowerCase())), [roster.data, q]);
  const close = () => {
    setPicked(null);
    setQ('');
    setPrice('');
    setNote('');
    onClose();
  };
  return (
    <Drawer open={open} onClose={close} title="Записать долг за заточку">
      {!picked ? (
        <>
          <input className="input" placeholder="Кому наточил?" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="list">
            {list.map((u) => (
              <button key={u.id} className="row" onClick={() => setPicked(u)}>
                <Avatar user={u} size="sm" />
                <div className="grow">
                  <div className="title">{u.name}</div>
                </div>
                <Jersey n={u.number} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="card tight hstack">
            <Avatar user={picked} />
            <b style={{ flex: 1 }}>{picked.name}</b>
            <button className="btn ghost xs" onClick={() => setPicked(null)}>
              Сменить
            </button>
          </div>
          <label className="field">
            <span>Сумма, ₾ (по умолчанию — цена заточки)</span>
            <input className="input" inputMode="numeric" value={price} placeholder="20" onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="field">
            <span>Комментарий игроку</span>
            <input className="input" value={note} placeholder="Заточка перед игрой 22.11" onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="muted small">Игрок сразу получит пуш, дальше бот напоминает раз в ~2,5 дня.</div>
          <button
            className="btn bad block"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.post('/api/service/sharpening/debt', { user_id: picked.id, note, price: price ? Number(price) : undefined });
                await onDone();
                close();
              }, `Долг записан, ${picked.first_name} получил пуш`)
            }
          >
            Записать долг
          </button>
        </>
      )}
    </Drawer>
  );
}
