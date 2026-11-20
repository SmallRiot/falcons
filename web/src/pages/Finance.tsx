import { t } from '@shared/i18n';
import { useState } from 'react';
import { CheckCircle2, Clock, Info, Lock, Wallet } from 'lucide-react';
import { api, type FinanceData, type Plan } from '@shared/api';
import { DUE_STATUS, fmt, PLAN_LABEL } from '@shared/format';
import { haptic } from '@shared/tg';
import { can, Empty, ProofImage, Spinner, useAction, useApi, useMe } from '@shared/ui';
import PaySheet from './PaySheet';

const PLAN_DESC: Record<string, string> = {
  full: t('Хожу на все тренировки, играю в чемпионате'),
  partial: t('Тренировки не чаще 1 раза в неделю, играю в чемпионате'),
  donation: t('Не играю в чемпионате, до 2 тренировок в месяц или просто поддержать'),
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
          <h1>{t('Взносы')}</h1>
        </div>
        <Empty icon={<Wallet size={26} />} title={t('Сбор ещё не открыт')} />
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
  const exempt = !!due && due.plan === 'exempt' && due.custom_amount == null;
  const chosen = !!due && (!!due.plan || due.custom_amount != null);
  const canPay = p.locked && chosen && !exempt && (due!.status === 'unpaid' || due!.status === 'rejected');
  const canChoose = !p.locked || !chosen;
  // оплатить можно и прошлый долг
  const debtTarget = debts.find((d) => d.period_id !== p.id);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('Взносы')}</h1>
          <div className="sub">{t('Лёд, тренер, судьи — делим на всех')}</div>
        </div>
      </div>

      {debtTarget && (
        <div className="alert bad">
          <Info size={20} />
          <div className="body">
            <b>
              {t('Долг за')} {fmt.month(debtTarget.month).toLowerCase()} — {fmt.gel(debtTarget.amount)}
            </b>
            {debtTarget.comment ? t('Комментарий админа: {0}', debtTarget.comment) : t('Оплати и прикрепи скрин.')}
            <div style={{ marginTop: 10 }}>
              <button
                className="btn sm bad"
                onClick={() => setPayFor({ id: debtTarget.period_id, month: debtTarget.month, amount: debtTarget.amount })}
              >
                {t('Оплатить долг')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="between">
          <div>
            <div className="muted small">{t('Взнос')}</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{fmt.month(p.month)}</div>
          </div>
          {p.locked ? (
            <span className="chip ok">
              <Lock size={12} /> {t('Сбор идёт')}
            </span>
          ) : (
            <span className="chip info">{t('Опрос')}</span>
          )}
        </div>
        <div className="divider" style={{ margin: '12px 0 8px' }} />
        <div className="hstack small muted wrap" style={{ gap: 14 }}>
          <span>{t('Полный:')} <b style={{ color: 'var(--ink)' }}>{r.nFull}</b></span>
          <span>{t('Частичный:')} <b style={{ color: 'var(--ink)' }}>{r.nPartial}</b></span>
          <span>{t('Донат:')} <b style={{ color: 'var(--ink)' }}>{r.nDonation}</b></span>
          {r.nUndecided > 0 && <span>{t('Не выбрали:')} <b style={{ color: 'var(--warn)' }}>{r.nUndecided}</b></span>}
        </div>
      </div>

      <div className="section-title">{t('Мой вариант')}</div>
      {exempt ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🙌</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{t('Ты освобождён от взноса')}</div>
          <div className="muted small" style={{ marginTop: 4 }}>
            {t('За')} {fmt.month(p.month).toLowerCase()} {t('платить не нужно — так решил админ. Если это ошибка, напиши ему.')}
          </div>
        </div>
      ) : due?.custom_amount != null ? (
        <div className="card">
          <div className="muted small">{t('Админ назначил индивидуальную сумму')}</div>
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
              {t('🧮 Суммы посчитаем, когда все выберут. Как только админ начнёт сбор — бот пришлёт тебе твою сумму, а здесь появится кнопка «Оплатить»: реквизиты в один тап и место для скрина перевода.')}
            </div>
          )}
        </div>
      )}

      {due && chosen && p.locked && !exempt && (
        <div className="card">
          <div className="between">
            <div>
              <div className="muted small">{t('К оплате за')} {fmt.month(p.month).toLowerCase()}</div>
              <div className="big-amount">{fmt.gel(due.amount)}</div>
            </div>
            <span className={`chip ${DUE_STATUS[due.status].tone}`}>
              {due.status === 'paid' ? <CheckCircle2 size={12} /> : due.status === 'pending' ? <Clock size={12} /> : null}
              {DUE_STATUS[due.status].label}
            </span>
          </div>
          {due.status === 'rejected' && due.comment && (
            <div className="alert bad" style={{ marginTop: 12 }}>
              <div className="body">{t('Админ:')} {due.comment}</div>
            </div>
          )}
          {canPay && (
            <button className="btn block" style={{ marginTop: 14 }} onClick={() => setPayFor({ id: p.id, month: p.month, amount: due.amount })}>
              {t('Оплатить')} {fmt.gel(due.amount)}
            </button>
          )}
          {due.proof && (
            <>
              <button className="btn ghost sm block" style={{ marginTop: 10 }} onClick={() => setShowProof((s) => !s)}>
                {showProof ? t('Скрыть скрин') : t('Мой скрин')}
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
          <div className="section-title">{t('История')}</div>
          <div className="list">
            {history.map((h) => (
              <div key={h.period.id} className="row">
                <div className="grow">
                  <div className="title">{fmt.month(h.period.month)}</div>
                  <div className="meta">{h.due?.plan ? PLAN_LABEL[h.due.plan] : '—'}</div>
                </div>
                <span className="num" style={{ fontWeight: 700 }}>
                  {h.period.locked ? fmt.gel(h.due?.amount) : '—'}
                </span>
                {h.due &&
                  (h.due.plan === 'exempt' && h.due.custom_amount == null ? (
                    <span className="chip ok">{t('Освобождён')}</span>
                  ) : h.period.locked ? (
                    <span className={`chip ${DUE_STATUS[h.due.status].tone}`}>{DUE_STATUS[h.due.status].label}</span>
                  ) : (
                    <span className="chip info">{t('Опрос, сбора не было')}</span>
                  ))}
              </div>
            ))}
          </div>
        </>
      )}

      <PaySheet
        open={!!payFor}
        onClose={() => setPayFor(null)}
        title={payFor ? t('Взнос · {0}', fmt.month(payFor.month)) : t('Оплата')}
        amount={payFor?.amount ?? null}
        purpose={`Falcons ${payFor?.month ?? p.month} — ${me.user.name}`}
        accounts={accounts}
        allowNoProof={can(me, 'admin')}
        cardUrl={data.cardPayUrl}
        onSubmit={async (file, comment) => {
          const fd = new FormData();
          fd.append('comment', comment);
          if (file) fd.append('file', file);
          return run(async () => {
            await api.post(`/api/finance/${payFor!.id}/proof`, fd);
            await Promise.all([reload(), refresh()]);
          }, file ? t('Скрин отправлен на проверку') : t('Отмечено: оплачено'));
        }}
      />
    </div>
  );
}
