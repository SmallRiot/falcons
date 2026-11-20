import { useState } from 'react';
import { CheckCircle2, Clock, Info, Lock, Wallet } from 'lucide-react';
import { api, type FinanceData, type Plan } from '../api';
import { DUE_STATUS, fmt, PLAN_LABEL } from '../format';
import { haptic } from '../tg';
import { Empty, ProofImage, Spinner, useAction, useApi, useMe } from '../ui';
import PaySheet from './PaySheet';

const PLAN_DESC: Record<string, string> = {
  full: 'Хожу на все тренировки, играю в чемпионате',
  partial: 'Тренировки не чаще 1 раза в неделю, играю в чемпионате',
  donation: 'Не играю в чемпионате, до 2 тренировок в месяц или просто поддержать',
};

export default function Finance() {
  const { me, refresh } = useMe();
  const { data, loading, reload } = useApi<FinanceData>('/api/finance');
  const [payFor, setPayFor] = useState<{ id: number; month: string; amount: number | null } | null>(null);
  const [showProof, setShowProof] = useState(false);
  const { busy, run } = useAction();

  if (loading || !data) return <Spinner />;
  const [cur, ...history] = data.items;
  if (!cur)
    return (
      <div className="page">
        <div className="page-head">
          <h1>Взносы</h1>
        </div>
        <Empty icon={<Wallet size={26} />} title="Сбор ещё не открыт" />
      </div>
    );

  const accounts = data.accounts.filter((a) => a.purpose === 'dues');
  const debts = me.debts ?? [];
  const p = cur.period;
  const due = cur.due;
  const r = cur.rates;
  const choose = (plan: Plan) =>
    run(async () => {
      haptic.select();
      await api.post(`/api/finance/${p.id}/plan`, { plan });
      await reload();
    });

  const price = (plan: Plan) => (plan === 'full' ? r.full : plan === 'partial' ? r.partial : r.donation);
  const chosen = !!due && (!!due.plan || due.custom_amount != null);
  const canPay = p.locked && chosen && (due!.status === 'unpaid' || due!.status === 'rejected');
  const canChoose = !p.locked || !chosen;
  // оплатить можно и прошлый долг
  const debtTarget = debts.find((d) => d.period_id !== p.id);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Взносы</h1>
          <div className="sub">Лёд, тренер, судьи — делим на всех</div>
        </div>
      </div>

      {debtTarget && (
        <div className="alert bad">
          <Info size={20} />
          <div className="body">
            <b>
              Долг за {fmt.month(debtTarget.month).toLowerCase()} — {fmt.gel(debtTarget.amount)}
            </b>
            {debtTarget.comment ? `Комментарий админа: ${debtTarget.comment}` : 'Оплати и прикрепи скрин.'}
            <div style={{ marginTop: 10 }}>
              <button
                className="btn sm bad"
                onClick={() => setPayFor({ id: debtTarget.period_id, month: debtTarget.month, amount: debtTarget.amount })}
              >
                Оплатить долг
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="between">
          <div>
            <div className="muted small">Бюджет · {fmt.month(p.month)}</div>
            <div style={{ fontSize: 24, fontWeight: 800 }} className="num">
              {fmt.gel(p.budget)}
            </div>
          </div>
          {p.locked ? (
            <span className="chip ok">
              <Lock size={12} /> Сбор идёт
            </span>
          ) : (
            <span className="chip info">Опрос</span>
          )}
        </div>
        <div className="divider" style={{ margin: '12px 0 8px' }} />
        <div className="hstack small muted wrap" style={{ gap: 14 }}>
          <span>Полный: <b style={{ color: 'var(--ink)' }}>{r.nFull}</b></span>
          <span>Частичный: <b style={{ color: 'var(--ink)' }}>{r.nPartial}</b></span>
          <span>Донат: <b style={{ color: 'var(--ink)' }}>{r.nDonation}</b></span>
          {r.nUndecided > 0 && <span>Не выбрали: <b style={{ color: 'var(--warn)' }}>{r.nUndecided}</b></span>}
        </div>
      </div>

      <div className="section-title">Мой вариант</div>
      {due?.custom_amount != null ? (
        <div className="card">
          <div className="muted small">Админ назначил индивидуальную сумму</div>
          <div className="big-amount">{fmt.gel(due.custom_amount)}</div>
        </div>
      ) : (
        <div className="vstack">
          {(['full', 'partial', 'donation'] as Plan[]).map((plan) => (
            <button
              key={plan}
              className={`plan-opt ${due?.plan === plan ? 'on' : ''}`}
              disabled={busy || !canChoose || due?.status === 'paid' || due?.status === 'pending'}
              onClick={() => choose(plan)}
            >
              <span className="radio" />
              <div className="grow" style={{ flex: 1 }}>
                <b>
                  {PLAN_LABEL[plan]}
                  {plan === 'partial' ? ` · ${Math.round(p.partial_ratio * 100)}%` : ''}
                </b>
                <div className="d">{PLAN_DESC[plan]}</div>
              </div>
              {p.locked ? <span className="price">{fmt.gel(price(plan))}</span> : plan === 'donation' ? <span className="price">{fmt.gel(p.donation_amount)}</span> : null}
            </button>
          ))}
          {!p.locked && (
            <div className="muted small" style={{ padding: '0 4px' }}>
              🧮 Суммы посчитаем, когда все выберут. Как только админ начнёт сбор — бот пришлёт тебе твою сумму.
            </div>
          )}
        </div>
      )}

      {due && chosen && p.locked && (
        <div className="card">
          <div className="between">
            <div>
              <div className="muted small">К оплате за {fmt.month(p.month).toLowerCase()}</div>
              <div className="big-amount">{fmt.gel(due.amount)}</div>
            </div>
            <span className={`chip ${DUE_STATUS[due.status].tone}`}>
              {due.status === 'paid' ? <CheckCircle2 size={12} /> : due.status === 'pending' ? <Clock size={12} /> : null}
              {DUE_STATUS[due.status].label}
            </span>
          </div>
          {due.status === 'rejected' && due.comment && (
            <div className="alert bad" style={{ marginTop: 12 }}>
              <div className="body">Админ: {due.comment}</div>
            </div>
          )}
          {canPay && (
            <button className="btn block" style={{ marginTop: 14 }} onClick={() => setPayFor({ id: p.id, month: p.month, amount: due.amount })}>
              Оплатить {fmt.gel(due.amount)}
            </button>
          )}
          {due.proof && (
            <>
              <button className="btn ghost sm block" style={{ marginTop: 10 }} onClick={() => setShowProof((s) => !s)}>
                {showProof ? 'Скрыть скрин' : 'Мой скрин'}
              </button>
              {showProof && (
                <div style={{ marginTop: 10 }}>
                  <ProofImage name={due.proof} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {history.length > 0 && (
        <>
          <div className="section-title">История</div>
          <div className="list">
            {history.map((h) => (
              <div key={h.period.id} className="row">
                <div className="grow">
                  <div className="title">{fmt.month(h.period.month)}</div>
                  <div className="meta">{h.due?.plan ? PLAN_LABEL[h.due.plan] : '—'}</div>
                </div>
                <span className="num" style={{ fontWeight: 700 }}>
                  {fmt.gel(h.due?.amount)}
                </span>
                {h.due && <span className={`chip ${DUE_STATUS[h.due.status].tone}`}>{DUE_STATUS[h.due.status].label}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      <PaySheet
        open={!!payFor}
        onClose={() => setPayFor(null)}
        title={payFor ? `Взнос · ${fmt.month(payFor.month)}` : 'Оплата'}
        amount={payFor?.amount ?? null}
        purpose={`Falcons ${payFor?.month ?? p.month} — ${me.user.name}`}
        accounts={accounts}
        onSubmit={async (file, comment) => {
          const fd = new FormData();
          fd.append('comment', comment);
          fd.append('file', file);
          return run(async () => {
            await api.post(`/api/finance/${payFor!.id}/proof`, fd);
            await Promise.all([reload(), refresh()]);
          }, 'Скрин отправлен на проверку');
        }}
      />
    </div>
  );
}
