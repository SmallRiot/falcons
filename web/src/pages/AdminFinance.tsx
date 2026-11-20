import { useEffect, useState } from 'react';
import { Ban, BellRing, Play, Plus, Receipt, Settings2, Unlock } from 'lucide-react';
import { api, type DueStatus, type Period, type Plan, type PublicUser, type Rates } from '@shared/api';
import { DUE_STATUS, fmt, PLAN_LABEL } from '@shared/format';
import { Avatar, Empty, ProofImage, Segmented, Sheet, Spinner, toast, useAction, useApi, useMe } from '@shared/ui';

type PeriodRow = Period & { rates: Rates; counts: Partial<Record<DueStatus, number>> };
interface DueItem {
  user: PublicUser & { signup_blocked: boolean };
  plan: Plan | null;
  custom_amount: number | null;
  amount: number | null;
  status: DueStatus;
  proof: string | null;
  comment: string | null;
  submitted_at: string | null;
}
interface PeriodDetail {
  period: Period;
  rates: Rates;
  dues: DueItem[];
}

export default function AdminFinance() {
  const { refresh } = useMe();
  const periods = useApi<PeriodRow[]>('/api/admin/periods');
  const [pid, setPid] = useState<number | null>(null);
  useEffect(() => {
    if (!pid && periods.data?.length) setPid(periods.data[0].id);
  }, [periods.data, pid]);
  const detail = useApi<PeriodDetail>(pid ? `/api/admin/periods/${pid}` : null, [pid]);
  const [filter, setFilter] = useState<'todo' | 'unpaid' | 'paid' | 'all'>('all');
  const [open, setOpen] = useState<DueItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { busy, run } = useAction();

  const reloadAll = () => Promise.all([periods.reload(), detail.reload(), refresh()]);

  if (periods.loading) return <Spinner />;

  const d = detail.data;
  const dues = d?.dues ?? [];
  const collected = dues.filter((x) => x.status === 'paid').reduce((s, x) => s + (x.amount ?? 0), 0);
  const expected = dues.reduce((s, x) => s + (x.amount ?? 0), 0);
  const list = dues.filter((x) =>
    filter === 'all'
      ? true
      : filter === 'todo'
        ? x.status === 'pending'
        : filter === 'paid'
          ? x.status === 'paid'
          : x.status === 'unpaid' || x.status === 'rejected',
  );
  const pendingN = dues.filter((x) => x.status === 'pending').length;
  const undecided = dues.filter((x) => !x.plan && x.custom_amount == null).length;

  const patchDue = (u: DueItem, body: Record<string, unknown>, ok: string) =>
    run(async () => {
      await api.patch(`/api/admin/periods/${pid}/dues/${u.user.id}`, body);
      await reloadAll();
      setOpen(null);
    }, ok);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Взносы</h1>
        <button className="btn sm" onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> Месяц
        </button>
      </div>

      {!periods.data?.length ? (
        <Empty icon={<Receipt size={26} />} title="Сборов ещё не было">
          Создай месяц — бот позовёт всех выбрать взнос.
        </Empty>
      ) : (
        <>
          <div className="chips" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
            {periods.data.map((p) => (
              <button
                key={p.id}
                className={`chip ${p.id === pid ? 'info' : ''}`}
                style={{ border: 0, height: 32, padding: '0 14px' }}
                onClick={() => setPid(p.id)}
              >
                {fmt.month(p.month)} {p.counts.pending ? `· ${p.counts.pending}🧾` : ''}
              </button>
            ))}
          </div>

          {d && (
            <div className="steps">
              <div className={`step ${d.period.locked ? 'done' : 'on'}`}>
                <b>1</b> Опрос
              </div>
              <div className="step-line" />
              <div className={`step ${d.period.locked ? 'on' : ''}`}>
                <b>2</b> Сбор денег
              </div>
            </div>
          )}

          {d && !d.period.locked && (
            <div className="card vstack" style={{ gap: 10 }}>
              <div className="between">
                <div>
                  <div className="muted small">Проголосовали</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }} className="num">
                    {dues.length - undecided} из {dues.length}
                  </div>
                </div>
                <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Настройки месяца">
                  <Settings2 size={18} />
                </button>
              </div>
              <div className="progress" style={{ height: 8 }}>
                <div style={{ width: `${dues.length ? ((dues.length - undecided) / dues.length) * 100 : 0}%` }} />
              </div>
              <div className="small muted">
                Бюджет {fmt.gel(d.period.budget)} (игроки его не видят). Если завершить сейчас: полный <b style={{ color: 'var(--ink)' }}>{fmt.gel(d.rates.full)}</b>, частичный{' '}
                <b style={{ color: 'var(--ink)' }}>{fmt.gel(d.rates.partial)}</b>, донат <b style={{ color: 'var(--ink)' }}>{fmt.gel(d.rates.donation)}</b>.
              </div>
              {undecided > 0 && (
                <div className="alert warn">
                  <div className="body">{undecided} чел. ещё не выбрали. Можно выбрать за них — тап по человеку внизу (фильтр «Все»).</div>
                </div>
              )}
              <button
                className="btn block"
                disabled={busy}
                onClick={() =>
                  confirm(
                    `Завершить опрос и начать сбор?\n\nПолный ${d.rates.full} ₾, частичный ${d.rates.partial} ₾, донат ${d.rates.donation} ₾.\nКаждый получит в личку свою сумму, неоплата станет долгом с напоминаниями.` +
                      (undecided ? `\n\n${undecided} чел. не выбрали — бот попросит их выбрать, сумма посчитается по тем же ставкам.` : ''),
                  ) &&
                  run(async () => {
                    await api.patch(`/api/admin/periods/${pid}`, { locked: true });
                    await reloadAll();
                  }, 'Опрос завершён — бот разослал суммы')
                }
              >
                <Play size={16} /> Завершить опрос и начать сбор
              </button>
            </div>
          )}

          {d && d.period.locked && (
            <div className="card vstack" style={{ gap: 12 }}>
              <div className="between">
                <div>
                  <div className="muted small">Собрано из {fmt.gel(expected)}</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }} className="num">
                    {fmt.gel(collected)}
                  </div>
                </div>
                <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Настройки месяца">
                  <Settings2 size={18} />
                </button>
              </div>
              <div className="progress" style={{ height: 8 }}>
                <div style={{ width: `${expected ? Math.min(100, (collected / expected) * 100) : 0}%`, background: 'var(--ok)' }} />
              </div>
              <div className="hstack wrap small muted" style={{ gap: 12 }}>
                <span>Бюджет <b style={{ color: 'var(--ink)' }}>{fmt.gel(d.period.budget)}</b></span>
                <span>Полный <b style={{ color: 'var(--ink)' }}>{fmt.gel(d.rates.full)}</b> ×{d.rates.nFull}</span>
                <span>Частичный <b style={{ color: 'var(--ink)' }}>{fmt.gel(d.rates.partial)}</b> ×{d.rates.nPartial}</span>
                <span>Донат <b style={{ color: 'var(--ink)' }}>{fmt.gel(d.rates.donation)}</b> ×{d.rates.nDonation}</span>
              </div>
              <div className="btn-row">
                <button
                  className="btn ghost sm"
                  disabled={busy}
                  onClick={() =>
                    confirm('Вернуть в опрос? Суммы снова будут считаться по голосам, при повторном старте бот разошлёт их заново.') &&
                    run(async () => {
                      await api.patch(`/api/admin/periods/${pid}`, { locked: false });
                      await reloadAll();
                    }, 'Вернули в опрос')
                  }
                >
                  <Unlock size={16} /> Вернуть в опрос
                </button>
                <button
                  className="btn bad-soft sm"
                  disabled={busy}
                  onClick={() =>
                    confirm('Закрыть запись на тренировки всем, у кого есть долг?') &&
                    run(async () => {
                      const r = await api.post<{ blocked: number }>('/api/admin/block-debtors');
                      await reloadAll();
                      toast(`Запись закрыта: ${r.blocked} чел.`);
                    })
                  }
                >
                  <Ban size={16} /> Закрыть запись
                </button>
              </div>
              {(
                <button
                  className="btn ghost sm"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await api.post<{ sent: number }>('/api/admin/remind');
                      toast(r.sent ? `Отправлено напоминаний: ${r.sent}` : 'Некому напоминать 🎉');
                    })
                  }
                >
                  <BellRing size={16} /> Напомнить должникам сейчас
                </button>
              )}
              <div className="muted small">Бот сам напоминает должникам раз в ~2,5 дня (с 10 до 22).</div>
            </div>
          )}

          <div className="muted small" style={{ padding: '0 4px' }}>
            👋 Новичок посреди месяца, хочет просто задонатить или его надо освободить? Тапни по человеку → «Вариант и сумма». Бот сам пришлёт ему сумму.
          </div>

          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              ['todo', `Проверить${pendingN ? ` · ${pendingN}` : ''}`],
              ['unpaid', 'Не оплатили'],
              ['paid', 'Оплатили'],
              ['all', 'Все'],
            ]}
          />

          {detail.loading ? (
            <Spinner />
          ) : !list.length ? (
            <Empty icon={<Receipt size={26} />} title={filter === 'todo' ? 'Нечего проверять 🎉' : 'Пусто'} />
          ) : (
            <div className="list">
              {list.map((x) => (
                <button key={x.user.id} className="row" onClick={() => setOpen(x)}>
                  <Avatar user={x.user} />
                  <div className="grow">
                    <div className="title">{x.user.name}</div>
                    <div className="meta">
                      {x.custom_amount != null ? 'Индивидуально' : x.plan ? PLAN_LABEL[x.plan] : 'не выбрал'}
                      {x.user.signup_blocked ? ' · ⛔︎ запись' : ''}
                    </div>
                  </div>
                  <span className="num" style={{ fontWeight: 700 }}>
                    {fmt.gel(x.amount)}
                  </span>
                  {x.plan === 'exempt' && x.custom_amount == null ? (
                    <span className="chip ok">Освобождён</span>
                  ) : !d?.period.locked ? (
                    <span className="chip info">{x.plan || x.custom_amount != null ? 'Голос' : 'Не выбрал'}</span>
                  ) : (
                    <span className={`chip ${DUE_STATUS[x.status].tone}`}>{DUE_STATUS[x.status].label}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <DueSheet item={open} onClose={() => setOpen(null)} busy={busy} onPatch={patchDue} rates={d?.rates ?? null} locked={!!d?.period.locked} />
      <CreatePeriod open={createOpen} onClose={() => setCreateOpen(false)} onCreated={async (id) => { await periods.reload(); setPid(id); }} />
      {d && <PeriodSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} period={d.period} onSaved={reloadAll} />}
    </div>
  );
}

function DueSheet({
  item,
  onClose,
  busy,
  onPatch,
  rates,
  locked,
}: {
  item: DueItem | null;
  onClose: () => void;
  busy: boolean;
  onPatch: (u: DueItem, b: Record<string, unknown>, ok: string) => void;
  rates: Rates | null;
  locked: boolean;
}) {
  const [comment, setComment] = useState('');
  const [custom, setCustom] = useState('');
  useEffect(() => {
    setComment('');
    setCustom(item?.custom_amount != null ? String(item.custom_amount) : '');
  }, [item]);
  if (!item) return null;
  return (
    <Sheet open onClose={onClose} title={item.user.name}>
      <div className="card tight">
        <div className="kv"><span>Вариант</span><span>{item.plan ? PLAN_LABEL[item.plan] : '—'}</span></div>
        <div className="kv"><span>Сумма</span><span>{fmt.gel(item.amount)}</span></div>
        <div className="kv"><span>Статус</span><span><span className={`chip ${DUE_STATUS[item.status].tone}`}>{DUE_STATUS[item.status].label}</span></span></div>
        {item.submitted_at && <div className="kv"><span>Скрин прислан</span><span>{fmt.dateShort(item.submitted_at)}, {fmt.time(item.submitted_at)}</span></div>}
        {item.comment && <div className="kv"><span>Комментарий</span><span>{item.comment}</span></div>}
      </div>

      {item.proof && <ProofImage name={item.proof} />}

      {item.status === 'pending' && (
        <>
          <input className="input" placeholder="Причина, если отклоняешь" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="btn-row">
            <button className="btn bad-soft" disabled={busy} onClick={() => onPatch(item, { status: 'rejected', comment }, 'Отклонено, игрок получил уведомление')}>
              Отклонить
            </button>
            <button className="btn ok" disabled={busy} onClick={() => onPatch(item, { status: 'paid' }, 'Оплата подтверждена')}>
              Деньги пришли
            </button>
          </div>
        </>
      )}
      {(item.status === 'unpaid' || item.status === 'rejected') && (
        <button className="btn ok-soft block" disabled={busy} onClick={() => onPatch(item, { status: 'paid' }, 'Отмечено как оплачено')}>
          Отметить оплаченным (наличные и т.п.)
        </button>
      )}
      {item.status === 'paid' && (
        <button className="btn ghost block" disabled={busy} onClick={() => onPatch(item, { status: 'unpaid' }, 'Оплата снята')}>
          Снять отметку об оплате
        </button>
      )}

      <div className="section-title">Вариант и сумма</div>
      <div className="muted small">
        {locked
          ? 'Сбор уже идёт — новая сумма считается по зафиксированным ставкам, бот сразу пришлёт её человеку.'
          : 'Идёт опрос — можно выбрать за человека. Сумма придёт ему, когда начнёшь сбор.'}
      </div>
      <div className="chips">
        {(['full', 'partial', 'donation', 'exempt'] as Plan[]).map((p) => (
          <button
            key={p}
            className={`chip ${item.plan === p && item.custom_amount == null ? 'info' : ''}`}
            style={{ border: 0, height: 34, padding: '0 12px' }}
            disabled={busy}
            onClick={() => onPatch(item, { plan: p, custom_amount: null }, p === 'exempt' ? 'Освобождён — бот сообщил' : 'Вариант изменён')}
          >
            {PLAN_LABEL[p]}
            {rates && p !== 'exempt' ? ` · ${fmt.gel(p === 'full' ? rates.full : p === 'partial' ? rates.partial : rates.donation)}` : ''}
          </button>
        ))}
      </div>
      {rates && (
        <div className="chips">
          <span className="muted small" style={{ alignSelf: 'center' }}>Пришёл посреди месяца:</span>
          {[
            ['½ полного', Math.ceil(rates.full / 2 / 5) * 5],
            ['½ частичного', Math.ceil(rates.partial / 2 / 5) * 5],
          ].map(([label, v]) => (
            <button
              key={label as string}
              className="chip"
              style={{ border: 0, height: 34, padding: '0 12px' }}
              disabled={busy}
              onClick={() => onPatch(item, { custom_amount: v }, `Назначено ${v} ₾`)}
            >
              {label} · {fmt.gel(v as number)}
            </button>
          ))}
        </div>
      )}
      <div className="hstack">
        <input className="input" inputMode="numeric" placeholder="Своя сумма, ₾ (например, разовый донат)" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ''))} />
        <button className="btn secondary" disabled={busy} onClick={() => onPatch(item, { custom_amount: custom === '' ? null : Number(custom) }, custom === '' ? 'Сумма по варианту' : 'Сумма назначена')}>
          {custom === '' ? 'Сброс' : 'OK'}
        </button>
      </div>
    </Sheet>
  );
}

function CreatePeriod({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => Promise<void> }) {
  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  const [f, setF] = useState({ month: next.toISOString().slice(0, 7), budget: '6000', partial: '70', donation: '100', notify: true });
  const { busy, run } = useAction();
  return (
    <Sheet open={open} onClose={onClose} title="Новый месяц">
      <div className="form">
        <div className="form-row">
          <label className="field">
            <span>Месяц</span>
            <input className="input" type="month" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} />
          </label>
          <label className="field">
            <span>Бюджет, ₾</span>
            <input className="input" inputMode="numeric" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
          </label>
        </div>
        <div className="form-row">
          <label className="field">
            <span>Частичный, % от полного</span>
            <input className="input" inputMode="numeric" value={f.partial} onChange={(e) => setF({ ...f, partial: e.target.value })} />
          </label>
          <label className="field">
            <span>Донат, ₾</span>
            <input className="input" inputMode="numeric" value={f.donation} onChange={(e) => setF({ ...f, donation: e.target.value })} />
          </label>
        </div>
        <div className="muted small">Сначала опрос: игроки выбирают вариант, суммы не видят. Когда все выберут — жми «Начать сбор», и бот разошлёт каждому его сумму. Выбор из прошлого месяца перенесётся.</div>
        <label className="check">
          <input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} />
          Опрос в чат (без сумм)
        </label>
        <button
          className="btn block"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const p = await api.post<Period>('/api/admin/periods', {
                month: f.month,
                budget: Number(f.budget),
                partial_ratio: Number(f.partial) / 100,
                donation_amount: Number(f.donation),
                notify: f.notify,
              });
              await onCreated(p.id);
              onClose();
            }, 'Месяц создан')
          }
        >
          Запустить опрос
        </button>
      </div>
    </Sheet>
  );
}

function PeriodSettings({ open, onClose, period, onSaved }: { open: boolean; onClose: () => void; period: Period; onSaved: () => Promise<unknown> }) {
  const [f, setF] = useState({ budget: '', partial: '', donation: '' });
  const { busy, run } = useAction();
  useEffect(() => {
    setF({ budget: String(period.budget), partial: String(Math.round(period.partial_ratio * 100)), donation: String(period.donation_amount) });
  }, [period, open]);
  return (
    <Sheet open={open} onClose={onClose} title={fmt.month(period.month)}>
      <div className="form">
        <label className="field">
          <span>Бюджет, ₾</span>
          <input className="input" inputMode="numeric" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
        </label>
        <div className="form-row">
          <label className="field">
            <span>Частичный, %</span>
            <input className="input" inputMode="numeric" value={f.partial} onChange={(e) => setF({ ...f, partial: e.target.value })} />
          </label>
          <label className="field">
            <span>Донат, ₾</span>
            <input className="input" inputMode="numeric" value={f.donation} onChange={(e) => setF({ ...f, donation: e.target.value })} />
          </label>
        </div>
        {period.locked && <div className="muted small">Суммы зафиксированы: изменения применятся после разблокировки и повторной фиксации.</div>}
        <button
          className="btn block"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api.patch(`/api/admin/periods/${period.id}`, {
                budget: Number(f.budget),
                partial_ratio: Number(f.partial) / 100,
                donation_amount: Number(f.donation),
              });
              await onSaved();
              onClose();
            }, 'Сохранено')
          }
        >
          Сохранить
        </button>
      </div>
    </Sheet>
  );
}
