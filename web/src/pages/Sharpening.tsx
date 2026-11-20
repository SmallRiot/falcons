import { t } from '@shared/i18n';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Scissors, Sparkles } from 'lucide-react';
import { api, type Account } from '@shared/api';
import { fmt } from '@shared/format';
import { can, Empty, Spinner, useAction, useApi, useMe } from '@shared/ui';
import PaySheet from './PaySheet';

export interface SharpItem {
  id: number;
  note: string | null;
  proof: string | null;
  price: number;
  status: 'new' | 'accepted' | 'done' | 'rejected';
  payment: 'unpaid' | 'pending' | 'paid';
  comment: string | null;
  created_at: string;
  updated_at: string | null;
}

export const SHARP_STATUS: Record<SharpItem['status'], { label: string; tone: string; step: number }> = {
  new: { label: t('Проверка оплаты'), tone: 'info', step: 1 },
  accepted: { label: t('В работе'), tone: 'warn', step: 2 },
  done: { label: t('Готово'), tone: 'ok', step: 3 },
  rejected: { label: t('Отклонено'), tone: 'bad', step: 0 },
};

export const PAY_STATUS: Record<SharpItem['payment'], { label: string; tone: string }> = {
  unpaid: { label: t('Долг'), tone: 'bad' },
  pending: { label: t('Оплата на проверке'), tone: 'info' },
  paid: { label: t('Оплачено'), tone: 'ok' },
};

export function Steps({ status }: { status: SharpItem['status'] }) {
  const st = SHARP_STATUS[status];
  return (
    <div className="steps">
      {[1, 2, 3].map((i) => (
        <div key={i} className={`s ${status === 'rejected' ? 'bad' : status === 'done' ? 'done' : i <= st.step ? 'on' : ''}`} />
      ))}
    </div>
  );
}

export default function Sharpening() {
  const { me, refresh } = useMe();
  const nav = useNavigate();
  const { data, loading, reload } = useApi<{ price: number; items: SharpItem[]; vouchers?: number }>('/api/sharpening');
  const accounts = useApi<Account[]>('/api/accounts');
  const [open, setOpen] = useState(false);
  const [payDebt, setPayDebt] = useState<SharpItem | null>(null);
  const { run, busy } = useAction();

  if (loading || !data) return <Spinner />;
  const accs = (accounts.data ?? []).filter((a) => a.purpose === 'sharpening');
  const active = data.items.filter((i) => i.status === 'new' || i.status === 'accepted');
  const debts = data.items.filter((i) => i.payment === 'unpaid' && i.status !== 'rejected');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('Заточка')}</h1>
          <div className="sub">{t('Оставь коньки сервис-менеджеру — наточим к тренировке')}</div>
        </div>
      </div>

      {can(me, 'service', 'admin') && (
        <div className="list">
          <button className="row" onClick={() => nav('/service')}>
            <Scissors size={20} color="var(--falcon)" />
            <div className="grow">
              <div className="title">{t('Очередь заточки')}</div>
              <div className="meta">{t('Для сервис-менеджера')}</div>
            </div>
            {!!me.badges?.sharpenings && <span className="chip bad">{me.badges.sharpenings}</span>}
            <ChevronRight size={18} className="chev" />
          </button>
        </div>
      )}

      {debts.map((d) => (
        <div key={d.id} className="alert bad">
          <Scissors size={20} />
          <div className="body">
            <b>{t('Долг за заточку —')} {fmt.gel(d.price)}</b>
            {d.note ? `«${d.note}» · ` : ''}
            {fmt.dateShort(d.updated_at ?? d.created_at)}
            {d.comment ? ` · ${d.comment}` : ''}
            <div style={{ marginTop: 10 }}>
              <button className="btn sm bad" onClick={() => setPayDebt(d)}>
                {t('Оплатить долг')}
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="hero" style={{ paddingBottom: 18 }}>
        <div className="eyebrow">{t('Заточка коньков')}</div>
        <div className="between" style={{ marginTop: 6 }}>
          <div style={{ fontSize: 34, fontWeight: 800 }} className="num">
            {fmt.gel(data.price)}
          </div>
          <Sparkles size={30} />
        </div>
        <button
          className="btn block"
          style={{ background: '#fff', color: 'var(--falcon-deep)', marginTop: 14 }}
          disabled={active.length >= 2}
          onClick={() => setOpen(true)}
        >
          {t('Заказать заточку')}
        </button>
        {!!data.vouchers && (
          <button
            className="btn block"
            style={{ marginTop: 10, background: 'linear-gradient(90deg,#e9c57e,#b98a3a)', color: '#2a1d05' }}
            disabled={busy || active.length >= 2}
            onClick={() =>
              run(async () => {
                await api.post('/api/sharpening/voucher', {});
                await Promise.all([reload(), refresh()]);
              }, t('Заявка отправлена — по призу, без оплаты'))
            }
          >
            🎁 {t('Заточка по призу — бесплатно')}{data.vouchers > 1 ? ` (${data.vouchers})` : ''}
          </button>
        )}
      </div>

      <div className="section-title">{t('Мои заявки')}</div>
      {data.items.length ? (
        <div className="vstack">
          {data.items.map((s) => (
            <div key={s.id} className="card tight vstack">
              <div className="between">
                <div>
                  <b>{t('Заявка #')}{s.id}</b>
                  <div className="muted small">
                    {fmt.dateShort(s.created_at)} · {fmt.gel(s.price)}
                  </div>
                </div>
                <div className="chips" style={{ justifyContent: 'flex-end' }}>
                  {s.payment !== 'paid' && <span className={`chip ${PAY_STATUS[s.payment].tone}`}>{PAY_STATUS[s.payment].label}</span>}
                  <span className={`chip ${SHARP_STATUS[s.status].tone}`}>{SHARP_STATUS[s.status].label}</span>
                </div>
              </div>
              <Steps status={s.status} />
              {s.note && <div className="small">«{s.note}»</div>}
              {s.comment && <div className="small muted">{t('Сервис:')} {s.comment}</div>}
              {s.status === 'new' && s.payment !== 'unpaid' && (
                <button
                  className="btn ghost xs"
                  style={{ alignSelf: 'flex-start' }}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api.del(`/api/sharpening/${s.id}`);
                      await reload();
                    }, t('Заявка отменена'))
                  }
                >
                  {t('Отменить')}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={<Scissors size={26} />} title={t('Заявок пока нет')} />
      )}

      <PaySheet
        open={!!payDebt}
        onClose={() => setPayDebt(null)}
        title={t('Долг за заточку')}
        amount={payDebt?.price ?? null}
        purpose={t('Заточка — {0}', me.user.name)}
        accounts={accs}
        commentPlaceholder={null}
        onSubmit={async (file) => {
          const fd = new FormData();
          fd.append('file', file!);
          return run(async () => {
            await api.post(`/api/sharpening/${payDebt!.id}/proof`, fd);
            await Promise.all([reload(), refresh()]);
          }, t('Скрин отправлен точильщику'));
        }}
      />

      <PaySheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('Заточка коньков')}
        amount={data.price}
        purpose={t('Заточка — {0}', me.user.name)}
        accounts={accs}
        submitLabel={t('Отправить заявку')}
        commentPlaceholder={t('Пожелания: радиус, когда привезёшь коньки… (необязательно)')}
        onSubmit={async (file, comment) => {
          const fd = new FormData();
          fd.append('note', comment);
          fd.append('file', file!);
          return run(async () => {
            await api.post('/api/sharpening', fd);
            await Promise.all([reload(), refresh()]);
          }, t('Заявка отправлена сервис-менеджеру'));
        }}
      />
    </div>
  );
}
