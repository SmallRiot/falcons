import { useState } from 'react';
import { Copy, ClipboardList, CreditCard } from 'lucide-react';
import { openLink } from '@shared/tg';
import type { Account } from '@shared/api';
import { bankFromIban, fmt } from '@shared/format';
import { copyText, CopyRow, FilePick, Sheet } from '@shared/ui';


const BANK_LOGO: Record<string, string> = { TBC: '/banks/tbc.svg', BOG: '/banks/bog.svg' };

export function BankCard({ acc, amount }: { acc: Account; amount?: number | null }) {
  const all = [`IBAN: ${acc.iban}`, `Получатель: ${acc.holder}`, amount ? `Сумма: ${amount} GEL` : '']
    .filter(Boolean)
    .join('\n');
  const bank = bankFromIban(acc.iban);
  return (
    <div className={`bank-card ${['TBC', 'BOG', 'Liberty'].includes(bank.code) ? bank.code : 'other'}`}>
      <div className="bk">
        <span className="hstack" style={{ gap: 8 }}>
          {BANK_LOGO[bank.code] && <img className="bank-logo" src={BANK_LOGO[bank.code]} alt="" />}
          {bank.name}
        </span>
        <span style={{ opacity: 0.8 }}>GEL</span>
      </div>
      <div className="ib">{fmt.iban(acc.iban)}</div>
      <div className="hd">{acc.holder}</div>
      <div className="actions">
        <button onClick={() => copyText(acc.iban, 'IBAN скопирован')}>
          <Copy size={14} /> IBAN
        </button>
        <button onClick={() => copyText(acc.holder, 'ФИО скопировано')}>
          <Copy size={14} /> ФИО
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
  /** админу можно отметить оплату без скрина */
  allowNoProof?: boolean;
  /** подсказка в поле комментария; null — поля нет */
  commentPlaceholder?: string | null;
  /** оплата картой по ссылке — последним пунктом */
  cardUrl?: string | null;
  onSubmit: (file: File | null, comment: string) => Promise<boolean>;
};

export default function PaySheet({ open, onClose, title, amount, purpose, accounts, submitLabel, extra, allowNoProof, cardUrl, commentPlaceholder, onSubmit }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (f: File | null) => {
    setBusy(true);
    const ok = await onSubmit(f, comment);
    setBusy(false);
    if (ok) {
      setFile(null);
      setComment('');
      onClose();
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="card center" style={{ padding: '18px 16px' }}>
        <div className="muted small">К переводу</div>
        <div className="big-amount">{fmt.gel(amount)}</div>
      </div>

      <div className="section-title">1 · Переведи на любой счёт</div>
      {accounts.length ? (
        accounts.map((a) => <BankCard key={a.id} acc={a} amount={amount} />)
      ) : (
        <div className="alert warn">
          <div className="body">Админ ещё не добавил счета.</div>
        </div>
      )}
      <div className="vstack">
        {amount != null && <CopyRow label="Сумма" value={`${amount} GEL`} copy={String(amount)} />}
      </div>
      {cardUrl && (
        <button className="btn secondary block" onClick={() => openLink(cardUrl)}>
          <CreditCard size={18} /> Оплатить картой по ссылке
        </button>
      )}

      <div className="section-title">2 · Прикрепи скрин перевода{allowNoProof ? ' (админу — необязательно)' : ''}</div>
      {extra}
      <FilePick file={file} onChange={setFile} />
      {commentPlaceholder !== null && (
        <textarea
          className="input"
          rows={2}
          placeholder={commentPlaceholder ?? 'Комментарий (необязательно)'}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      )}
      <button className="btn block" disabled={!file || busy} onClick={() => submit(file)}>
        {busy ? 'Отправляю…' : (submitLabel ?? 'Отправить на проверку')}
      </button>
      {allowNoProof && (
        <button className="btn ghost block" disabled={busy} onClick={() => submit(null)}>
          Я админ — отметить оплаченным без скрина
        </button>
      )}
    </Sheet>
  );
}
