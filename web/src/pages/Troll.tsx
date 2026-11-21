import { t } from '@shared/i18n';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type FinanceData, type NickStyle } from '@shared/api';
import { fmt } from '@shared/format';
import { Avatar, Nick, Segmented, Spinner, toastErr, useAction, useApi } from '@shared/ui';
import PaySheet from './PaySheet';

type Player = { id: number; name: string; first_name: string; last_name: string | null; photo_url: string | null; username?: string | null; style?: NickStyle | null };
type TrollCfg = { price: number; days: number; players: Player[]; active: { target_id: number; expires_at: string }[] };

/** Бот-тролль на неделю: жертва + досье + анонимно или нет → перевод со скрином → владелец включает. */
export default function Troll() {
  const nav = useNavigate();
  const cfg = useApi<TrollCfg>('/api/troll');
  const fin = useApi<FinanceData>('/api/finance');
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<number | null>(null);
  const [dossier, setDossier] = useState('');
  const [anon, setAnon] = useState<'anon' | 'named'>('anon');
  const [open, setOpen] = useState(false);
  const { run } = useAction();

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (cfg.data?.players ?? []).filter((p) => !s || `${p.name} ${p.username ?? ''}`.toLowerCase().includes(s)).slice(0, s ? 30 : 8);
  }, [q, cfg.data]);
  if (!cfg.data) return <Spinner />;
  const picked = cfg.data.players.find((p) => p.id === target);
  const already = cfg.data.active.filter((a) => a.target_id === target).sort((a, b) => b.expires_at.localeCompare(a.expires_at))[0];
  const ready = !!picked && dossier.trim().length >= 10;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>🧌 {t('Бот-тролль')}</h1>
          <div className="sub">{t('Неделю подкалывает одного человека в командном чате')}</div>
        </div>
      </div>

      <div className="card vstack" style={{ gap: 10 }}>
        <b>{t('1. Кого троллим')}</b>
        {picked ? (
          <div className="row" style={{ padding: 0 }}>
            <Avatar user={picked} size="sm" />
            <div className="grow">
              <div className="title">
                <Nick user={picked} text={picked.name} />
              </div>
              {already && <div className="meta">{t('Уже троллят до')} {fmt.dateShort(already.expires_at)} — {t('неделя добавится')}</div>}
            </div>
            <button className="btn ghost sm" onClick={() => setTarget(null)}>
              {t('Другой')}
            </button>
          </div>
        ) : (
          <>
            <input className="input" placeholder={t('Найти игрока')} value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="list">
              {list.map((p) => (
                <button key={p.id} className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setTarget(p.id)}>
                  <Avatar user={p} size="sm" />
                  <div className="grow">
                    <div className="title">
                      <Nick user={p} text={p.name} />
                    </div>
                  </div>
                </button>
              ))}
              {!list.length && <div className="muted small">{t('Никого не нашли')}</div>}
            </div>
          </>
        )}
      </div>

      <div className="card vstack" style={{ gap: 10 }}>
        <b>{t('2. Досье')}</b>
        <div className="muted small">{t('За что цеплять: привычки, косяки, внешность, легенды из раздевалки. Чем конкретнее — тем смешнее.')}</div>
        <textarea
          className="input"
          rows={6}
          maxLength={2000}
          value={dossier}
          placeholder={t('Вечно опаздывает на лёд, ноет про плечо, боится судей, в прошлом сезоне забил в свои…')}
          onChange={(e) => setDossier(e.target.value)}
        />
        <div className="muted small" style={{ textAlign: 'right' }}>
          {dossier.length} / 2000
        </div>
      </div>

      <div className="card vstack" style={{ gap: 10 }}>
        <b>{t('3. Подпись')}</b>
        <Segmented
          value={anon}
          onChange={setAnon}
          options={[
            ['anon', t('🤫 Анонимно')],
            ['named', t('От моего имени')],
          ]}
        />
        <div className="muted small">
          {anon === 'anon' ? t('В чате напишут, что заказчик пожелал остаться неизвестным.') : t('В чате напишут, что тролля заказал ты.')}
        </div>
      </div>

      <button className="btn block" disabled={!ready} onClick={() => setOpen(true)}>
        {t('Спустить тролля')} — X ₾
      </button>
      <div className="muted small">
        {t('Переведи и прикрепи скрин — владелец проверит и выпустит тролля на')} {cfg.data.days} {t('дней. Бот сам решает, когда влезть, и троллит без цензуры.')}
      </div>

      <PaySheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('Бот-тролль')}
        amount={null}
        purpose=""
        accounts={(fin.data?.accounts ?? []).filter((a) => a.purpose === 'dues')}
        cardUrl={fin.data?.cardPayUrl}
        commentPlaceholder={null}
        onSubmit={async (file) => {
          if (!picked) {
            toastErr(new Error(t('Выбери, кого троллить')));
            return false;
          }
          const fd = new FormData();
          fd.append('target', String(picked.id));
          fd.append('dossier', dossier.trim());
          fd.append('anon', anon === 'anon' ? '1' : '0');
          fd.append('file', file!);
          return run(async () => {
            await api.post('/api/troll', fd);
            nav('/profile', { replace: true });
          }, t('Скрин отправлен — тролль выйдет после проверки'));
        }}
      />
    </div>
  );
}
