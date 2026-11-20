import { useState } from 'react';
import { ExternalLink, Copy, ClipboardList } from 'lucide-react';
import type { Account } from '@shared/api';
import { fmt } from '@shared/format';
import { openLink } from '@shared/tg';
import { copyText, CopyRow, FilePick, Sheet } from '@shared/ui';

const BANK_CLASS = (b: string) => (['TBC', 'BOG', 'Liberty'].includes(b) ? b : 'other');
const BANK_NAME: Record<string, string> = { TBC: 'TBC Bank', BOG: 'Bank of Georgia', Liberty: 'Liberty Bank' };

export function BankCard({ acc, amount, purpose }: { acc: Account; amount?: number | null; purpose?: string }) {
  const all = [`Получатель: ${acc.holder}`, `IBAN: ${acc.iban}`, amount ? `Сумма: ${amount} GEL` : '', purpose ? `Назначение: ${purpose}` : '']
    .filter(Boolean)
    .join('\n');
  return (
    <div className={`bank-card ${BANK_CLASS(acc.bank)}`}>
      <div className="bk">
        <span>{BANK_NAME[acc.bank] ?? acc.bank}</span>
        <span style={{ opacity: 0.8 }}>GEL</span>
      </div>
      <div className="ib">{fmt.iban(acc.iban)}</div>
      <div className="hd">{acc.holder}</div>
      {acc.note && <div className="hd" style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>{acc.note}</div>}
      <div className="actions">
        {acc.pay_url && (
          <button className="primary" onClick={() => openLink(acc.pay_url!)}>
            <ExternalLink size={14} /> Оплатить в банке
          </button>
        )}
        <button onClick={() => copyText(acc.iban, 'IBAN скопирован')}>
          <Copy size={14} /> IBAN
        </button>
        <button onClick={() => copyText(all, 'Реквизиты скопированы')}>
          <ClipboardList size={14} /> Всё
        </button>
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  amount: number | null;
  purpose: string;
  accounts: Account[];
  submitLabel?: string;
  extra?: React.ReactNode;
  onSubmit: (file: File, comment: string) => Promise<boolean>;
};

export default function PaySheet({ open, onClose, title, amount, purpose, accounts, submitLabel, extra, onSubmit }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="card center" style={{ padding: '18px 16px' }}>
        <div className="muted small">К переводу</div>
        <div className="big-amount">{fmt.gel(amount)}</div>
      </div>

      <div className="section-title">1 · Переведи на любой счёт</div>
      {accounts.length ? (
        accounts.map((a) => <BankCard key={a.id} acc={a} amount={amount} purpose={purpose} />)
      ) : (
        <div className="alert warn">
          <div className="body">Админ ещё не добавил счета.</div>
        </div>
      )}
      <div className="vstack">
        {amount != null && <CopyRow label="Сумма" value={`${amount} GEL`} copy={String(amount)} />}
        <CopyRow label="Назначение платежа" value={purpose} copy={purpose} />
      </div>

      <div className="section-title">2 · Прикрепи скрин перевода</div>
      {extra}
      <FilePick file={file} onChange={setFile} />
      <input className="input" placeholder="Комментарий (необязательно)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button
        className="btn block"
        disabled={!file || busy}
        onClick={async () => {
          setBusy(true);
          const ok = await onSubmit(file!, comment);
          setBusy(false);
          if (ok) {
            setFile(null);
            setComment('');
            onClose();
          }
        }}
      >
        {busy ? 'Отправляю…' : (submitLabel ?? 'Отправить на проверку')}
      </button>
    </Sheet>
  );
}
