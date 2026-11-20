import { useMemo, useState } from 'react';
import { Plus, Scissors, Search } from 'lucide-react';
import { api, type PublicUser } from '../api';
import { fmt } from '../format';
import { Avatar, Empty, Jersey, ProofImage, Segmented, Sheet, Spinner, useAction, useApi, useMe } from '../ui';
import { PAY_STATUS, SHARP_STATUS, Steps, type SharpItem } from './Sharpening';

type Item = SharpItem & { user: PublicUser };

export default function Service() {
  const { refresh } = useMe();
  const [scope, setScope] = useState<'active' | 'debts' | 'all'>('active');
  const { data, loading, reload } = useApi<Item[]>(`/api/service/sharpening${scope === 'all' ? '?all=1' : ''}`, [scope === 'all']);
  const [open, setOpen] = useState<Item | null>(null);
  const [debtOpen, setDebtOpen] = useState(false);
  const [comment, setComment] = useState('');
  const { busy, run } = useAction();

  const isDebt = (s: Item) => s.payment === 'unpaid' && s.status !== 'rejected';
  const list = (data ?? []).filter((s) => (scope === 'debts' ? isDebt(s) : scope === 'active' ? !isDebt(s) : true));
  const debtTotal = (data ?? []).filter(isDebt).reduce((a, s) => a + s.price, 0);

  const patch = (s: Item, body: Partial<Pick<SharpItem, 'status' | 'payment'>>, ok: string) =>
    run(async () => {
      await api.patch(`/api/service/sharpening/${s.id}`, { ...body, comment });
      setOpen(null);
      setComment('');
      await Promise.all([reload(), refresh()]);
    }, ok);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Заточка</h1>
        <button className="btn sm bad-soft" onClick={() => setDebtOpen(true)}>
          <Plus size={16} /> Долг
        </button>
      </div>
      <Segmented
        value={scope}
        onChange={setScope}
        options={[
          ['active', 'Очередь'],
          ['debts', `Должники${debtTotal ? ` · ${debtTotal} ₾` : ''}`],
          ['all', 'Все'],
        ]}
      />
      {loading ? (
        <Spinner />
      ) : !list.length ? (
        <Empty icon={<Scissors size={26} />} title={scope === 'debts' ? 'Должников нет 🎉' : 'Очередь пуста'} />
      ) : (
        <div className="vstack">
          {list.map((s) => (
            <div key={s.id} className="card tight vstack clickable" onClick={() => setOpen(s)}>
              <div className="hstack">
                <Avatar user={s.user} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{s.user.name}</b>
                  <div className="muted small">
                    #{s.id} · {fmt.dateShort(s.created_at)}, {fmt.time(s.created_at)} · {fmt.gel(s.price)}
                  </div>
                </div>
                <div className="chips" style={{ justifyContent: 'flex-end' }}>
                  {s.payment !== 'paid' && <span className={`chip ${PAY_STATUS[s.payment].tone}`}>{PAY_STATUS[s.payment].label}</span>}
                  {!isDebt(s) && <span className={`chip ${SHARP_STATUS[s.status].tone}`}>{SHARP_STATUS[s.status].label}</span>}
                </div>
              </div>
              {s.note && <div className="small">«{s.note}»</div>}
              {!isDebt(s) && <Steps status={s.status} />}
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `Заточка #${open.id}` : ''}>
        {open && (
          <>
            <div className="hstack">
              <Avatar user={open.user} />
              <div>
                <b>{open.user.name}</b>
                <div className="muted small">
                  {fmt.gel(open.price)} · {PAY_STATUS[open.payment].label}
                </div>
              </div>
            </div>
            {open.note && <div className="card tight">«{open.note}»</div>}
            {open.proof && <ProofImage name={open.proof} />}
            <input className="input" placeholder="Комментарий игроку (необязательно)" value={comment} onChange={(e) => setComment(e.target.value)} />

            {open.payment === 'pending' && (
              <div className="btn-row">
                <button className="btn bad-soft" disabled={busy} onClick={() => patch(open, { payment: 'unpaid' }, 'Записан долг, игрок получил пуш')}>
                  Оплаты нет
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    patch(open, open.status === 'new' ? { status: 'accepted' } : { payment: 'paid' }, open.status === 'new' ? 'Взято в работу' : 'Оплата подтверждена')
                  }
                >
                  {open.status === 'new' ? 'Оплата ок, беру' : 'Оплата ок'}
                </button>
              </div>
            )}
            {open.payment === 'unpaid' && (
              <button className="btn ok-soft block" disabled={busy} onClick={() => patch(open, { payment: 'paid' }, 'Долг закрыт')}>
                Получил деньги (наличными и т.п.)
              </button>
            )}
            {open.status === 'new' && open.payment !== 'pending' && (
              <button className="btn block" disabled={busy} onClick={() => patch(open, { status: 'accepted' }, 'Взято в работу')}>
                Взять в работу
              </button>
            )}
            {open.status === 'accepted' && (
              <button className="btn ok block" disabled={busy} onClick={() => patch(open, { status: 'done' }, 'Готово — игрок получил пуш')}>
                Готово, можно забирать
              </button>
            )}
            {open.payment === 'paid' && open.status !== 'accepted' && (
              <button className="btn bad-soft block" disabled={busy} onClick={() => patch(open, { payment: 'unpaid' }, 'Записан долг')}>
                Деньги не пришли — записать долг
              </button>
            )}
          </>
        )}
      </Sheet>

      <AddDebt open={debtOpen} onClose={() => setDebtOpen(false)} onDone={async () => { setScope('debts'); await Promise.all([reload(), refresh()]); }} />
    </div>
  );
}

function AddDebt({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const roster = useApi<(PublicUser & { roles: string[] })[]>(open ? '/api/roster' : null, [open]);
  const settings = useApi<{ price: number }>(open ? '/api/sharpening' : null, [open]);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<PublicUser | null>(null);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const { busy, run } = useAction();
  const list = useMemo(
    () => (roster.data ?? []).filter((u) => !q || `${u.name} ${u.number ?? ''}`.toLowerCase().includes(q.toLowerCase())),
    [roster.data, q],
  );
  const close = () => {
    setPicked(null);
    setQ('');
    setNote('');
    setPrice('');
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title="Записать долг за заточку">
      {!picked ? (
        <>
          <div style={{ position: 'relative' }}>
            <Search size={17} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--muted)' }} />
            <input className="input" style={{ paddingLeft: 40 }} placeholder="Кому наточил?" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
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
        <div className="form">
          <div className="card tight hstack">
            <Avatar user={picked} />
            <b style={{ flex: 1 }}>{picked.name}</b>
            <button className="btn ghost xs" onClick={() => setPicked(null)}>
              Сменить
            </button>
          </div>
          <label className="field">
            <span>Сумма, ₾</span>
            <input className="input" inputMode="numeric" placeholder={String(settings.data?.price ?? 20)} value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="field">
            <span>Комментарий</span>
            <input className="input" placeholder="Например: заточка перед игрой 22.11" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="muted small">Игрок сразу получит пуш, а дальше бот будет напоминать раз в ~2,5 дня, пока не оплатит.</div>
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
        </div>
      )}
    </Sheet>
  );
}
