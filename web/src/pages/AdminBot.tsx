import { t } from '@shared/i18n';
import { useState } from 'react';
import { api } from '@shared/api';
import { fmt } from '@shared/format';
import { Segmented, Spinner, toast, toastErr, useApi } from '@shared/ui';

type ChatMsg = { id: number; user_id: number | null; name: string; text: string; at: string };
type BotChat = { topics: Record<string, string>; connected: boolean; messages: ChatMsg[] };

/** Любой админ: написать в командный чат от имени бота — в топик или реплаем на сообщение. */
export default function AdminBot() {
  const { data, reload } = useApi<BotChat>('/api/admin/bot/chat');
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('general');
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <Spinner />;

  const send = async () => {
    setBusy(true);
    try {
      await api.post('/api/admin/bot/say', { text: text.trim(), ...(replyTo ? { replyTo: replyTo.id } : { topic }) });
      toast(t('Бот написал в чат'));
      setText('');
      setReplyTo(null);
      reload();
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>🤖 {t('Написать от бота')}</h1>
          <div className="sub">{t('Сообщение уйдёт в командный чат от имени бота')}</div>
        </div>
      </div>
      {!data.connected && (
        <div className="alert warn">
          <div className="body">{t('Бот не подключён к командному чату — напиши в группе /here_general.')}</div>
        </div>
      )}

      <div className="card vstack" style={{ gap: 10 }}>
        {replyTo ? (
          <div className="row" style={{ padding: 0, alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="meta">↩️ {t('Ответ на')} {replyTo.name}</div>
              <div className="small" style={{ marginTop: 2 }}>{replyTo.text.slice(0, 160)}</div>
            </div>
            <button className="btn ghost sm" onClick={() => setReplyTo(null)}>
              {t('Убрать')}
            </button>
          </div>
        ) : (
          <Segmented value={topic} onChange={setTopic} options={Object.entries(data.topics).map(([k, v]) => [k, t(v)] as [string, string])} />
        )}
        <textarea className="input" rows={4} maxLength={3000} value={text} placeholder={t('Что написать…')} onChange={(e) => setText(e.target.value)} />
        <button className="btn block" disabled={busy || !text.trim() || !data.connected} onClick={send}>
          {t('Отправить от бота')}
        </button>
      </div>

      <div className="section-title">{t('Ответить на сообщение')}</div>
      {data.messages.length ? (
        <div className="list">
          {data.messages.map((m) => (
            <button
              key={m.id}
              className="row"
              style={{ width: '100%', textAlign: 'left', alignItems: 'flex-start', ...(replyTo?.id === m.id ? { outline: '2px solid var(--falcon)' } : {}) }}
              onClick={() => {
                setReplyTo(m);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <div className="grow">
                <div className="meta">
                  {m.user_id ? m.name : `🤖 ${t('Бот')}`} · {fmt.dateShort(m.at)} {new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="small" style={{ marginTop: 2 }}>{m.text}</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="muted small">{t('Пока нет сообщений — бот видит только то, что написали после его подключения.')}</div>
      )}
    </div>
  );
}
