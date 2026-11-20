import { useEffect, useState } from 'react';
import { Ban, BellRing, ClipboardList, Eye, Lock, Play, Plus, Settings2, Unlock } from 'lucide-react';
import Drawer from '../Drawer';
import { api, type DueStatus, type Period, type Plan, type PublicUser, type Rates } from '@shared/api';
import { DUE_STATUS, fmt, PLAN_LABEL } from '@shared/format';
import { copyText, ProofImage, Sheet, Spinner, SquadChip, toast, useAction, useApi, useMe } from '@shared/ui';

type PeriodRow = Period & { rates: Rates; counts: Partial<Record<DueStatus, number>> };
interface DueItem {
  user: PublicUser & { signup_blocked: boolean; squads: number[] };
  plan: Plan | null;
  custom_amount: number | null;
  amount: number | null;
  status: DueStatus;
  proof: string | null;
  comment: string | null;
  submitted_at: string | null;
}
type Filter = 'all' | 'paid' | 'unpaid' | 'pending' | 'noplan';

export default function ConsoleFinance() {
  const { me, refresh } = useMe();
  const periods = useApi<PeriodRow[]>('/api/admin/periods');
  const [pid, setPid] = useState<number | null>(null);
  useEffect(() => {
    if (!pid && periods.data?.length) setPid(periods.data[0].id);
  }, [periods.data, pid]);
  const detail = useApi<{ period: Period; rates: Rates; dues: DueItem[] }>(pid ? `/api/admin/periods/${pid}` : null, [pid]);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [squad, setSquad] = useState(0);
  const [proof, setProof] = useState<DueItem | null>(null);
  const [debtors, setDebtors] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { busy, run } = useAction();
  const reloadAll = () => Promise.all([periods.reload(), detail.reload(), refresh()]);

  if (periods.loading) return <Spinner />;
  if (periods.error)
    return (
      <div className="cpage">
        <div className="alert bad">
          <div className="body">Не удалось загрузить финансы: {periods.error}</div>
        </div>
      </div>
    );
  if (!periods.data?.length)
    return (
      <div className="cpage">
        <div className="c-head">
          <h1>Финансы</h1>
        </div>
        <div className="c-card pad">
          <p>Сборов ещё не было.</p>
          <button className="btn" onClick={() => setCreateOpen(true)}>
            <Plus size={18} /> Новый месяц
          </button>
        </div>
        <CreatePeriod open={createOpen} onClose={() => setCreateOpen(false)} onCreated={async (id) => { await periods.reload(); setPid(id); }} />
      </div>
    );

  const d = detail.data;
  const dues = d?.dues ?? [];
  const sqMap = new Map((me.squads ?? []).map((s) => [s.id, s]));
  const chosen = (x: DueItem) => !!x.plan || x.custom_amount != null;
  // долг появляется только после «Начать сбор»
  const isDebt = (x: DueItem) => !!d?.period.locked && (x.status === 'unpaid' || x.status === 'rejected') && (x.amount ?? 0) > 0;
  const match: Record<Filter, (x: DueItem) => boolean> = {
    all: () => true,
    paid: (x) => x.status === 'paid',
    unpaid: (x) => x.status === 'unpaid' || x.status === 'rejected',
    pending: (x) => x.status === 'pending',
    noplan: (x) => !chosen(x),
  };
  const rows = dues
    .filter(match[filter])
    .filter((x) => !squad || x.user.squads.includes(squad))
    .filter((x) => !q || x.user.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => `${a.user.last_name}${a.user.first_name}`.localeCompare(`${b.user.last_name}${b.user.first_name}`));
  const collected = dues.filter((x) => x.status === 'paid').reduce((s, x) => s + (x.amount ?? 0), 0);
  const expected = dues.reduce((s, x) => s + (x.amount ?? 0), 0);
  const debtorList = dues.filter(isDebt);

  const patchDue = (x: DueItem, body: Record<string, unknown>, ok: string) =>
    run(async () => {
      await api.patch(`/api/admin/periods/${pid}/dues/${x.user.id}`, body);
      await reloadAll();
      setProof(null);
    }, ok);

  const debtorsText = () =>
    d
      ? [`Должники за ${fmt.month(d.period.month).toLowerCase()}:`, ...debtorList.map((x, i) => `${i + 1}. ${x.user.name} — ${x.amount} ₾`), '', `Итого: ${debtorList.reduce((s, x) => s + (x.amount ?? 0), 0)} ₾`].join('\n')
      : '';

  return (
    <div className="cpage">
      <div className="c-head">
        <div>
          <div className="small" style={{ color: 'var(--falcon)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Взносы · {d ? fmt.month(d.period.month) : ''}
          </div>
          <h1>Финансы</h1>
          <div className="sub">
            {dues.length} игроков · не оплачено {debtorList.length}/{dues.length}
          </div>
        </div>
        <div className="hstack wrap">
          <button className="btn ghost sm" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Новый месяц
          </button>
          <button className="btn sm" style={{ background: '#0d1f2d' }} disabled={!d?.period.locked} onClick={() => setDebtors(debtorsText())}>
            <ClipboardList size={16} /> Список должников
          </button>
          <button
            className="btn sm"
            disabled={busy || !d?.period.locked}
            onClick={() =>
              run(async () => {
                const r = await api.post<{ sent: number }>('/api/admin/remind');
                toast(r.sent ? `Отправлено напоминаний: ${r.sent}` : 'Некому напоминать 🎉');
              })
            }
          >
            <BellRing size={16} /> Напомнить о долге
          </button>
          <button
            className="btn bad-soft sm"
            disabled={busy || !d?.period.locked}
            onClick={() =>
              confirm('Закрыть запись на тренировки всем должникам?') &&
              run(async () => {
                const r = await api.post<{ blocked: number }>('/api/admin/block-debtors');
                await reloadAll();
                toast(`Запись закрыта: ${r.blocked} чел.`);
              })
            }
          >
            <Ban size={16} /> Закрыть запись должникам
          </button>
        </div>
      </div>

      {d && (
        <div className="c-card" style={{ padding: 16, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 200 }} value={pid ?? ''} onChange={(e) => setPid(Number(e.target.value))}>
            {periods.data.map((p) => (
              <option key={p.id} value={p.id}>
                {fmt.month(p.month)} {p.month.slice(0, 4)}
              </option>
            ))}
          </select>
          {d.period.locked ? (
            <>
              <span className="chip ok">
                <Lock size={12} /> Шаг 2 из 2 · сбор идёт · суммы у игроков
              </span>
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
                <Unlock size={15} /> Вернуть в опрос
              </button>
            </>
          ) : (
            <>
              <span className="chip info">
                Шаг 1 из 2 · опрос · проголосовали {dues.filter(chosen).length} из {dues.length}
              </span>
              <button
                className="btn sm"
                disabled={busy}
                onClick={() =>
                  confirm(
                    `Завершить опрос и начать сбор?\n\nПолный ${d.rates.full} ₾, частичный ${d.rates.partial} ₾, донат ${d.rates.donation} ₾. Каждый получит свою сумму в личку.` +
                      (dues.some((x) => !chosen(x)) ? `\n\nНе выбрали: ${dues.filter((x) => !chosen(x)).length} — бот попросит их выбрать.` : ''),
                  ) &&
                  run(async () => {
                    await api.patch(`/api/admin/periods/${pid}`, { locked: true });
                    await reloadAll();
                  }, 'Сбор начат — бот разослал суммы')
                }
              >
                <Play size={15} /> Завершить опрос и начать сбор
              </button>
            </>
          )}
          <button className="icon-btn" title="Бюджет и проценты" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={17} />
          </button>
          <span className="muted small" style={{ flexBasis: '100%' }}>
            👋 Новичок посреди месяца, разовый донат или освобождение — выбери в колонке «Вариант» (там же «Своя сумма…»). Бот сам пришлёт человеку сумму.
          </span>
          <span className="muted small" style={{ marginLeft: 'auto' }}>
            Бюджет {fmt.gel(d.period.budget)} · полный {fmt.gel(d.rates.full)} × {d.rates.nFull} · частичный {fmt.gel(d.rates.partial)} × {d.rates.nPartial} · донат{' '}
            {fmt.gel(d.rates.donation)} × {d.rates.nDonation}
          </span>
        </div>
      )}

      <div className="kpis">
        <Kpi k="Собрано" v={fmt.gel(collected)} />
        <Kpi k="Ожидаем всего" v={fmt.gel(expected)} />
        <Kpi k="Долг" v={fmt.gel(debtorList.reduce((s, x) => s + (x.amount ?? 0), 0))} />
        <Kpi k="Скринов на проверке" v={String(dues.filter((x) => x.status === 'pending').length)} />
      </div>

      <div className="c-bar">
        <input className="input" placeholder="Поиск по имени/фамилии" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={squad} onChange={(e) => setSquad(Number(e.target.value))}>
          <option value={0}>Все составы</option>
          {(me.squads ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {(
          [
            ['all', 'Все'],
            ['paid', 'Оплачено'],
            ['unpaid', 'Не оплачено'],
            ['pending', 'На проверке'],
            ['noplan', 'Не выбрали'],
          ] as [Filter, string][]
        ).map(([f, l]) => (
          <button key={f} className={`btn sm ${filter === f ? '' : 'ghost'}`} onClick={() => setFilter(f)}>
            {l} {dues.filter(match[f]).length}
          </button>
        ))}
      </div>

      {detail.loading ? (
        <Spinner />
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th className="sticky-col">Игрок</th>
                <th>Составы</th>
                <th>Взнос</th>
                <th className="num">К оплате</th>
                <th>Статус</th>
                <th>Скрин</th>
                <th>Запись</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={x.user.id}>
                  <td className="muted">{i + 1}</td>
                  <td className="sticky-col">
                    <div className="player">
                      <span className="no">{x.user.number ?? ''}</span>
                      {x.user.last_name ? `${x.user.last_name} ${x.user.first_name}` : x.user.first_name}
                    </div>
                  </td>
                  <td>
                    <div className="chips" style={{ flexWrap: 'nowrap' }}>
                      {x.user.squads.map((id) => sqMap.get(id) && <SquadChip key={id} squad={sqMap.get(id)!} />)}
                    </div>
                  </td>
                  <td>
                    <select
                      className="input"
                      style={{ height: 32, width: 140, padding: '0 8px' }}
                      value={x.custom_amount != null ? 'custom' : (x.plan ?? '')}
                      onChange={(e) => {
                        if (e.target.value !== 'custom') return patchDue(x, { plan: e.target.value || null, custom_amount: null }, 'Вариант изменён');
                        const v = prompt(`Своя сумма для ${x.user.name}, ₾ (новичок посреди месяца, разовый донат…)`, x.custom_amount != null ? String(x.custom_amount) : '');
                        if (v && Number(v) >= 0) void patchDue(x, { custom_amount: Number(v) }, `Назначено ${Number(v)} ₾`);
                      }}
                    >
                      <option value="">— не выбран</option>
                      {(['full', 'partial', 'donation', 'exempt'] as Plan[]).map((p) => (
                        <option key={p} value={p}>
                          {PLAN_LABEL[p]}
                        </option>
                      ))}
                      <option value="custom">{x.custom_amount != null ? `Своя сумма · ${x.custom_amount} ₾` : 'Своя сумма…'}</option>
                    </select>
                  </td>
                  <td className="num">
                    <b>{d?.period.locked ? fmt.gel(x.amount) : <span className="muted">{fmt.gel(x.amount)}</span>}</b>
                  </td>
                  <td>
                    {x.plan === 'exempt' && x.custom_amount == null ? (
                      <span className="chip ok">Освобождён</span>
                    ) : !d?.period.locked ? (
                      <span className="chip info">{chosen(x) ? 'Проголосовал' : 'Не выбрал'}</span>
                    ) : (
                      <span className={`chip ${DUE_STATUS[x.status].tone}`}>{DUE_STATUS[x.status].label}</span>
                    )}
                  </td>
                  <td>
                    {x.proof ? (
                      <button className="btn ghost xs" onClick={() => setProof(x)}>
                        <Eye size={14} /> Смотреть
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{x.user.signup_blocked ? <span className="chip bad">закрыта</span> : <span className="muted">—</span>}</td>
                  <td>
                    <div className="hstack" style={{ justifyContent: 'flex-end' }}>
                      {x.status === 'pending' && (
                        <>
                          <button className="btn ok xs" disabled={busy} onClick={() => patchDue(x, { status: 'paid' }, 'Оплата подтверждена')}>
                            Деньги пришли
                          </button>
                          <button className="btn bad-soft xs" disabled={busy} onClick={() => setProof(x)}>
                            Отклонить…
                          </button>
                        </>
                      )}
                      {isDebt(x) && (
                        <button className="btn ok-soft xs" disabled={busy} onClick={() => patchDue(x, { status: 'paid' }, 'Отмечено оплаченным')}>
                          Оплачено
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreatePeriod open={createOpen} onClose={() => setCreateOpen(false)} onCreated={async (id) => { await periods.reload(); setPid(id); }} />
      {d && <PeriodSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} period={d.period} onSaved={reloadAll} />}
      <ProofSheet item={proof} onClose={() => setProof(null)} busy={busy} onPatch={patchDue} />
      <Sheet open={!!debtors} onClose={() => setDebtors(null)} title="Список должников">
        <pre className="card" style={{ whiteSpace: 'pre-wrap', margin: 0, font: 'inherit' }}>{debtors}</pre>
        <div className="btn-row">
          <button className="btn ghost" onClick={() => copyText(debtors ?? '', 'Список скопирован')}>
            Скопировать
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await api.post<{ posted: number }>(`/api/admin/periods/${pid}/debtors-post`);
                toast(`Таблица должников (${r.posted}) отправлена в чат`);
                setDebtors(null);
              })
            }
          >
            Отправить в чат таблицей
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function Kpi({ k, v }: { k: string; v: string }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function ProofSheet({ item, onClose, busy, onPatch }: { item: DueItem | null; onClose: () => void; busy: boolean; onPatch: (x: DueItem, b: Record<string, unknown>, ok: string) => void }) {
  const [comment, setComment] = useState('');
  useEffect(() => setComment(''), [item]);
  if (!item) return null;
  return (
    <Sheet open onClose={onClose} title={item.user.name}>
      <div className="muted small">
        {fmt.gel(item.amount)} · {item.submitted_at ? `прислал ${fmt.dateShort(item.submitted_at)}, ${fmt.time(item.submitted_at)}` : ''}
        {item.comment ? ` · «${item.comment}»` : ''}
      </div>
      {item.proof && <ProofImage name={item.proof} />}
      {item.status === 'pending' && (
        <>
          <input className="input" placeholder="Причина, если отклоняешь" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="btn-row">
            <button className="btn bad-soft" disabled={busy} onClick={() => onPatch(item, { status: 'rejected', comment }, 'Отклонено')}>
              Отклонить
            </button>
            <button className="btn ok" disabled={busy} onClick={() => onPatch(item, { status: 'paid' }, 'Оплата подтверждена')}>
              Деньги пришли
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function CreatePeriod({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => Promise<void> }) {
  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  const [f, setF] = useState({ month: next.toISOString().slice(0, 7), budget: '6000', partial: '70', donation: '100', notify: true });
  const { busy, run } = useAction();
  return (
    <Drawer open={open} onClose={onClose} title="Новый месяц">
      <div className="muted small">
        Сначала опрос: игроки выбирают вариант (в приложении или кнопками в чате), сумм не видят. Когда все выберут — «Начать сбор», и бот разошлёт каждому его сумму. Выбор из прошлого месяца переносится.
      </div>
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
      <label className="check">
        <input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} />
        Опрос в командный чат с кнопками
      </label>
      <button
        className="btn block"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const p = await api.post<Period>('/api/admin/periods', { month: f.month, budget: Number(f.budget), partial_ratio: Number(f.partial) / 100, donation_amount: Number(f.donation), notify: f.notify });
            await onCreated(p.id);
            onClose();
          }, 'Опрос запущен')
        }
      >
        Запустить опрос
      </button>
    </Drawer>
  );
}

function PeriodSettings({ open, onClose, period, onSaved }: { open: boolean; onClose: () => void; period: Period; onSaved: () => Promise<unknown> }) {
  const [f, setF] = useState({ budget: '', partial: '', donation: '' });
  const { busy, run } = useAction();
  useEffect(() => setF({ budget: String(period.budget), partial: String(Math.round(period.partial_ratio * 100)), donation: String(period.donation_amount) }), [period, open]);
  return (
    <Drawer open={open} onClose={onClose} title={`Настройки · ${fmt.month(period.month)}`}>
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
      {period.locked && <div className="muted small">Сбор уже идёт: новые суммы применятся после «Вернуть в опрос» и повторного «Начать сбор».</div>}
      <button
        className="btn block"
        disabled={busy}
        onClick={() =>
          run(async () => {
            await api.patch(`/api/admin/periods/${period.id}`, { budget: Number(f.budget), partial_ratio: Number(f.partial) / 100, donation_amount: Number(f.donation) });
            await onSaved();
            onClose();
          }, 'Сохранено')
        }
      >
        Сохранить
      </button>
    </Drawer>
  );
}
