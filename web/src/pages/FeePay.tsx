import { t } from '@shared/i18n';
import { useState } from 'react';
import { CheckCircle2, Clock, Ticket } from 'lucide-react';
import { api, type EventSummary, type FinanceData } from '@shared/api';
import { fmt } from '@shared/format';
import { useAction, useApi, useMe } from '@shared/ui';
import PaySheet from './PaySheet';

/**
 * Гость: оплата за выход на конкретное событие. Кнопка «Оплатить выход» + окно оплаты со скрином.
 * autoOpen — сразу после записи (как с заточкой).
 */
export function FeePay({ ev, onDone, autoOpen = false }: { ev: EventSummary; onDone: () => Promise<unknown> | void; autoOpen?: boolean }) {
  const fee = ev.myFee;
  const [open, setOpen] = useState(autoOpen);
  const fin = useApi<FinanceData>(open ? '/api/finance' : null, [open]);
  const { refresh } = useMe();
  const { run } = useAction();
  if (!fee || ev.my !== 'in') return null;

  if (fee.status === 'paid')
    return (
      <span className="chip ok" onClick={(e) => e.stopPropagation()}>
        <CheckCircle2 size={12} /> {t('Выход оплачен')}
      </span>
    );
  if (fee.status === 'pending')
    return (
      <span className="chip info" onClick={(e) => e.stopPropagation()}>
        <Clock size={12} /> {t('Скрин на проверке')}
      </span>
    );
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button className="btn sm bad-soft block" onClick={() => setOpen(true)}>
        <Ticket size={16} /> {t('Оплатить выход')} {fmt.gel(fee.amount)}
      </button>
      <PaySheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('Выход на лёд')}
        amount={fee.amount}
        purpose=""
        accounts={(fin.data?.accounts ?? []).filter((a) => a.purpose === 'dues')}
        cardUrl={fin.data?.cardPayUrl}
        commentPlaceholder={null}
        onSubmit={async (file) => {
          const fd = new FormData();
          fd.append('file', file!);
          return run(async () => {
            await api.post(`/api/fees/${fee.id}/proof`, fd);
            await Promise.all([onDone(), refresh()]);
          }, t('Скрин отправлен админу'));
        }}
      />
    </div>
  );
}
