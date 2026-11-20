import { t } from '@shared/i18n';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type FinanceData } from '@shared/api';
import { Avatar, useAction, useApi, useMe } from '@shared/ui';
import PaySheet from './PaySheet';

const NAMES: Record<string, string> = { torch: 'Грозный факел', gold: 'Золото', ice: 'Лёд', neon: 'Неон', fire: 'Огонь', falcons: 'Falcons', rainbow: 'Радуга' };

/** Особая рамка аватарки навсегда — 50 ₾ переводом, владелец подтверждает по скрину. */
export default function FrameForever() {
  const { me, refresh } = useMe();
  const nav = useNavigate();
  const cfg = useApi<{ price: number; designs: string[] }>('/api/frames/forever');
  const fin = useApi<FinanceData>('/api/finance');
  const [design, setDesign] = useState('torch');
  const [open, setOpen] = useState(false);
  const { run } = useAction();
  const designs = cfg.data?.designs ?? Object.keys(NAMES);
  const price = cfg.data?.price ?? 50;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('Рамка навсегда')}</h1>
          <div className="sub">{t('Выбери рамку — она останется с тобой насовсем')}</div>
        </div>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 24 }}>
        <Avatar user={{ ...me.user, style: { ...(me.user.style ?? {}), frame: design } }} size="lg" />
        <b>{t(NAMES[design] ?? design)}</b>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
        {designs.map((d) => (
          <button key={d} className={`card tight ${design === d ? 'on' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 14, border: design === d ? '2px solid var(--falcon)' : undefined }} onClick={() => setDesign(d)}>
            <Avatar user={{ ...me.user, style: { frame: d } }} />
            <span className="small">{t(NAMES[d] ?? d)}</span>
          </button>
        ))}
      </div>
      <button className="btn block" onClick={() => setOpen(true)}>
        {t('Оформить навсегда')} — {price} ₾
      </button>
      <div className="muted small">{t('Переведи и прикрепи скрин — владелец проверит и включит рамку. Пока ждёшь, можно взять рамку на месяц за очки в магазине игры.')}</div>
      <PaySheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('Рамка навсегда')}
        amount={price}
        purpose=""
        accounts={(fin.data?.accounts ?? []).filter((a) => a.purpose === 'dues')}
        cardUrl={fin.data?.cardPayUrl}
        commentPlaceholder={null}
        onSubmit={async (file) => {
          const fd = new FormData();
          fd.append('design', design);
          fd.append('file', file!);
          return run(async () => {
            await api.post('/api/frames/forever', fd);
            await refresh();
            nav('/profile', { replace: true });
          }, t('Скрин отправлен — рамка включится после проверки'));
        }}
      />
    </div>
  );
}
