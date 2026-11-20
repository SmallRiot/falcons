import { t } from '@shared/i18n';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Plus, Scissors, Search, X } from 'lucide-react';
import { api, type PublicUser } from '@shared/api';
import { fmt, plural } from '@shared/format';
import { Avatar, Empty, Jersey, ProofImage, Segmented, Sheet, Spinner, useAction, useApi, useMe } from '@shared/ui';
import { type SharpItem } from './Sharpening';

type Item = SharpItem & { user: PublicUser };
export type ServiceTab = 'checks' | 'queue' | 'debts';
const TABS: [ServiceTab, string][] = [
  ['checks', t('Чеки')],
  ['queue', t('Очередь')],
  ['debts', t('Долги')],
];

/**
 * Заточка для точильщика (и админа) — максимально просто, всё действие прямо на карточке:
 *  Чеки   — скрины оплат: «Деньги пришли» / «Не пришли»;
 *  Очередь — взять в работу / готово;
 *  Долги  — кто сколько должен, «Получил деньги», «Записать долг».
 */
export default function Service() {
  const { refresh } = useMe();
  const nav = useNavigate();
  const tab = (useParams().tab as ServiceTab) || 'checks';
  const { data, loading, reload } = useApi<Item[]>('/api/service/sharpening');
  const [debtOpen, setDebtOpen] = useState(false);
  const [checksView, setChecksView] = useState<'wait' | 'done'>('wait');
  const history = useApi<Item[]>(tab === 'checks' && checksView === 'done' ? '/api/service/sharpening?all=1' : null, [tab, checksView]);
  const [shown, setShown] = useState<number | null>(null);
  const { busy, run } = useAction();

  const all = data ?? [];
  const checks = all.filter((s) => s.payment === 'pending' && s.status !== 'rejected');
  const queue = all.filter((s) => (s.status === 'new' || s.status === 'accepted') && s.payment !== 'pending');
  const debts = all.filter((s) => s.payment === 'unpaid' && s.status !== 'rejected');
  const byUser = useMemo(() => {
    const m = new Map<number, { user: PublicUser; items: Item[]; total: number }>();
    for (const s of debts) {
      const g = m.get(s.user.id) ?? { user: s.user, items: [], total: 0 };
      g.items.push(s);
      g.total += s.price;
      m.set(s.user.id, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [debts]);
  const debtTotal = debts.reduce((a, s) => a + s.price, 0);

  const patch = (s: Item, body: Partial<Pick<SharpItem, 'status' | 'payment'>>, ok: string) =>
    run(async () => {
      await api.patch(`/api/service/sharpening/${s.id}`, body);
      await Promise.all([reload(), refresh()]);
    }, ok);
  const paidAll = (items: Item[], name: string) =>
    run(async () => {
      for (const s of items) await api.patch(`/api/service/sharpening/${s.id}`, { payment: 'paid' });
      await Promise.all([reload(), refresh()]);
    }, t('Долг {0} закрыт', name));

  const count: Record<ServiceTab, number> = { checks: checks.length, queue: queue.length, debts: byUser.length };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('Заточка')}</h1>
        <button className="btn sm bad-soft" onClick={() => setDebtOpen(true)}>
          <Plus size={16} /> {t('Долг')}
        </button>
      </div>
      <Segmented
        value={tab}
        onChange={(v) => nav(v === 'checks' ? '/service' : `/service/${v}`, { replace: true })}
        options={TABS.map(([k, l]) => [k, count[k] ? `${l} · ${count[k]}` : l])}
      />

      {loading ? (
        <Spinner />
      ) : tab === 'checks' && checksView === 'done' ? (
        <>
          <ChecksSwitch value={checksView} onChange={setChecksView} waiting={checks.length} />
          {history.loading ? (
            <Spinner />
          ) : (
            (() => {
              const done = (history.data ?? [])
                .filter((x) => x.payment === 'paid')
                .sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at));
              return !done.length ? (
                <Empty icon={<Check size={26} />} title={t('Принятых оплат пока нет')} />
              ) : (
                <div className="list">
                  {done.map((x) => (
                    <div key={x.id} className="row" style={{ flexWrap: 'wrap' }}>
                      <Avatar user={x.user} size="sm" />
                      <div className="grow">
                        <div className="title">{x.user.name}</div>
                        <div className="meta">
                          {t('принято')} {fmt.dateShort(x.updated_at ?? x.created_at)} · {x.proof ? t('по скрину') : t('без скрина')}
                        </div>
                      </div>
                      <b className="num">{fmt.gel(x.price)}</b>
                      {x.proof && (
                        <button className="btn ghost xs" onClick={() => setShown((v) => (v === x.id ? null : x.id))}>
                          {shown === x.id ? t('Скрыть') : t('Скрин')}
                        </button>
                      )}
                      {shown === x.id && x.proof && (
                        <div style={{ flexBasis: '100%' }}>
                          <ProofImage name={x.proof} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </>
      ) : tab === 'checks' ? (
        !checks.length ? (
          <>
            <ChecksSwitch value={checksView} onChange={setChecksView} waiting={0} />
            <Empty icon={<Check size={26} />} title={t('Чеков на проверку нет 👌')} />
          </>
        ) : (
          <div className="vstack">
            <ChecksSwitch value={checksView} onChange={setChecksView} waiting={checks.length} />
            <div className="muted small">{t('Сверь скрин с поступлением на свой счёт.')}</div>
            {checks.map((s) => (
              <div key={s.id} className="card vstack">
                <Who s={s} />
                {s.note && <div className="small">«{s.note}»</div>}
                {s.proof ? <ProofImage name={s.proof} /> : <div className="muted small">{t('Скрина нет')}</div>}
                <div className="btn-row">
                  <button className="btn bad-soft" disabled={busy} onClick={() => patch(s, { payment: 'unpaid' }, t('Записан долг, игрок получил пуш'))}>
                    <X size={18} /> {t('Не пришли')}
                  </button>
                  <button
                    className="btn ok"
                    disabled={busy}
                    onClick={() =>
                      patch(s, s.status === 'new' ? { payment: 'paid', status: 'accepted' } : { payment: 'paid' }, t('Оплата принята'))
                    }
                  >
                    <Check size={18} /> {t('Деньги пришли')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'queue' ? (
        !queue.length ? (
          <Empty icon={<Scissors size={26} />} title={t('Очередь пуста')} />
        ) : (
          <div className="vstack">
            {queue.map((s) => (
              <div key={s.id} className="card vstack">
                <Who s={s} />
                {s.note && <div className="small">«{s.note}»</div>}
                {s.status === 'new' ? (
                  <button className="btn block" disabled={busy} onClick={() => patch(s, { status: 'accepted' }, t('Взято в работу'))}>
                    {t('Взять в работу')}
                  </button>
                ) : (
                  <button className="btn ok block" disabled={busy} onClick={() => patch(s, { status: 'done' }, t('Готово — игрок получил пуш'))}>
                    <Check size={18} /> {t('Готово, можно забирать')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      ) : !byUser.length ? (
        <Empty icon={<Check size={26} />} title={t('Должников нет 🎉')} />
      ) : (
        <div className="vstack">
          <div className="card between">
            <div>
              <div className="muted small">{t('Должны за заточку')}</div>
              <div className="big-amount" style={{ fontSize: 28 }}>{fmt.gel(debtTotal)}</div>
            </div>
            <span className="muted small">
              {byUser.length} {plural(byUser.length, t('человек'), t('человека'), t('человек'))}
            </span>
          </div>
          <div className="muted small">{t('Бот сам напоминает должникам раз в ~2,5 дня.')}</div>
          {byUser.map((g) => (
            <div key={g.user.id} className="card vstack">
              <div className="hstack">
                <Avatar user={g.user} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{g.user.name}</b>
                  <div className="muted small">
                    {g.items.length} {plural(g.items.length, t('заточка'), t('заточки'), t('заточек'))} {t('· с')} {fmt.dateShort(g.items[g.items.length - 1].created_at)}
                  </div>
                </div>
                <b className="num" style={{ color: 'var(--bad)' }}>{fmt.gel(g.total)}</b>
              </div>
              <button className="btn ok-soft block" disabled={busy} onClick={() => paidAll(g.items, g.user.first_name)}>
                <Check size={18} /> {t('Получил')} {fmt.gel(g.total)}
              </button>
            </div>
          ))}
        </div>
      )}

      <AddDebt
        open={debtOpen}
        onClose={() => setDebtOpen(false)}
        onDone={async () => {
          nav('/service/debts', { replace: true });
          await Promise.all([reload(), refresh()]);
        }}
      />
    </div>
  );
}

function ChecksSwitch({ value, onChange, waiting }: { value: 'wait' | 'done'; onChange: (v: 'wait' | 'done') => void; waiting: number }) {
  return (
    <div className="chips">
      {(
        [
          ['wait', t('Ждут проверки{0}', waiting ? ` · ${waiting}` : '')],
          ['done', t('Принятые')],
        ] as const
      ).map(([k, l]) => (
        <button key={k} className={`chip ${value === k ? 'info' : ''}`} style={{ border: 0, height: 32, padding: '0 14px' }} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Who({ s }: { s: Item }) {
  return (
    <div className="hstack">
      <Avatar user={s.user} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{s.user.name}</b>
        <div className="muted small">
          {fmt.dateShort(s.created_at)}, {fmt.time(s.created_at)}
        </div>
      </div>
      <b className="num">{fmt.gel(s.price)}</b>
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
    <Sheet open={open} onClose={close} title={t('Записать долг за заточку')}>
      {!picked ? (
        <>
          <div style={{ position: 'relative' }}>
            <Search size={17} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--muted)' }} />
            <input className="input" style={{ paddingLeft: 40 }} placeholder={t('Кому наточил?')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
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
              {t('Сменить')}
            </button>
          </div>
          <label className="field">
            <span>{t('Сумма, ₾')}</span>
            <input className="input" inputMode="numeric" placeholder={String(settings.data?.price ?? 20)} value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="field">
            <span>{t('Комментарий')}</span>
            <input className="input" placeholder={t('Например: заточка перед игрой 22.11')} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="muted small">{t('Игрок сразу получит пуш, а дальше бот будет напоминать раз в ~2,5 дня, пока не оплатит.')}</div>
          <button
            className="btn bad block"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.post('/api/service/sharpening/debt', { user_id: picked.id, note, price: price ? Number(price) : undefined });
                await onDone();
                close();
              }, t('Долг записан, {0} получил пуш', picked.first_name))
            }
          >
            {t('Записать долг')}
          </button>
        </div>
      )}
    </Sheet>
  );
}
