import { t } from '@shared/i18n';
import { useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import { api } from '@shared/api';
import { fmt } from '@shared/format';
import { ShopAdmin } from '@shared/ShopAdmin';
import { GrantPoints } from '@shared/GrantPoints';
import { ORDER_STATUS, PROVIDER_NAME, pts, type ArcadeStats } from '@shared/arcadeStats';
import { ask, Avatar, Empty, Nick, ProofImage, Segmented, Spinner, toast, useAction, useApi } from '@shared/ui';

/** Админ: аналитика «Ледового дропа» и заказы из магазина (выдать / отменить). */
export default function AdminArcade() {
  const { data, loading, reload } = useApi<ArcadeStats>('/api/admin/arcade');
  const [tab, setTab] = useState<'orders' | 'shop' | 'grant' | 'players' | 'stats' | 'ai'>('orders');
  const { busy, run } = useAction();
  if (loading || !data) return <Spinner />;
  const T = data.totals;
  const setStatus = (id: number, status: 'issued' | 'cancelled' | 'approved', ok: string) =>
    run(async () => {
      await api.patch(`/api/admin/prizes/${id}`, { status });
      await reload();
    }, ok);

  const kpi = (v: string, l: string) => (
    <div className="card tight" style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 20, fontWeight: 800 }} className="num">
        {v}
      </div>
      <div className="muted small">{l}</div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('Игра и магазин')}</h1>
          <div className="sub">{t('«Ледовый дроп»: очки, броски, призы')}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        {kpi(String(T.players), t('играют · за 7 дней ') + T.active7)}
        {kpi(pts(T.balances), t('очков на руках'))}
        {kpi(pts(T.goals), t('выдано за голы'))}
        {kpi(pts(T.spent), t('потрачено в магазине'))}
        {kpi(T.drops.toLocaleString('ru-RU'), t('бросков'))}
        {kpi(T.rtp == null ? '—' : `${(T.rtp * 100).toFixed(1)}%`, t('фактический возврат (теория 97%)'))}
      </div>
      {T.toIssue > 0 && (
        <div className="alert warn">
          <div className="body">
            {t('Ждут выдачи:')} <b>{T.toIssue}</b>
          </div>
        </div>
      )}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ['orders', `${t('Заказы')} ${T.orders}`],
          ['shop', t('Магазин')],
          ['grant', t('🎁 Очки')],
          ['players', t('Игроки')],
          ['stats', t('Цифры')],
          ['ai', t('ИИ')],
        ]}
      />

      {tab === 'shop' ? (
        <ShopAdmin />
      ) : tab === 'grant' ? (
        <GrantPoints data={data} onDone={reload} />
      ) : tab === 'ai' ? (
        <AiTab ai={data.ai} onVkid={() => run(async () => { await api.post('/api/admin/ai/vkid'); await reload(); }, t('Вкид отправлен в чат'))} busy={busy} />
      ) : tab === 'orders' ? (
        !data.orders.length ? (
          <Empty icon={<Gamepad2 size={26} />} title={t('Заказов пока нет')} />
        ) : (
          <div className="list">
            {data.orders.map((o) => (
              <div key={o.id} className="row" style={{ flexWrap: 'wrap' }}>
                <Avatar user={o.user} size="sm" />
                <div className="grow">
                  <div className="title">
                    <Nick user={o.user} text={o.user.name} />
                  </div>
                  <div className="meta">
                    {o.title}
                    {o.option ? ` · ${o.option}` : ''} · {o.currency === 'gel' ? (o.price ? `${o.price} ₾` : 'X ₾') : pts(o.price)} · {fmt.dateShort(o.created_at)}
                  </div>
                </div>
                <span className={`chip ${ORDER_STATUS[o.status]?.[1] ?? ''}`}>{t(ORDER_STATUS[o.status]?.[0] ?? o.status)}</span>
                {o.status === 'awaiting' && o.proof && (
                  <div style={{ flexBasis: '100%' }}>
                    <ProofImage name={o.proof} />
                  </div>
                )}
                {(o.status === 'new' || o.status === 'awaiting' || (o.status === 'active' && o.kind !== 'shout')) && (
                  <div className="btn-row" style={{ flexBasis: '100%' }}>
                    <button
                      className="btn bad-soft sm"
                      disabled={busy}
                      onClick={async () =>
                        (await ask(t('Отменить заказ? Очки вернутся игроку.'), { okText: t('Отменить заказ'), danger: true })) &&
                        setStatus(o.id, 'cancelled', t('Отменено, очки вернулись'))
                      }
                    >
                      {t('Отменить')}
                    </button>
                    {o.status === 'new' && (
                      <button className="btn ok sm" disabled={busy} onClick={() => setStatus(o.id, 'issued', t('Отмечено: выдан'))}>
                        {t('Выдал приз')}
                      </button>
                    )}
                    {o.status === 'awaiting' && (
                      <button className="btn ok sm" disabled={busy} onClick={() => setStatus(o.id, 'approved', o.item === 'troll' ? t('Тролль выпущен в чат 🧌') : t('Рамка включена навсегда'))}>
                        {t('Деньги пришли')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : tab === 'players' ? (
        <div className="list">
          {data.players.map((p) => (
            <div key={p.user.id} className="row">
              <Avatar user={p.user} size="sm" />
              <div className="grow">
                <div className="title">
                  <Nick user={p.user} text={p.user.name} />
                </div>
                <div className="meta">
                  {t('голов')} {p.goals} · {t('бросков')} {p.drops} · {t('поставил')} {pts(p.wagered)} · {t('вернулось')} {pts(p.won)}
                  {p.spent ? ` · ${t('в магазине')} ${pts(p.spent)}` : ''}
                  {p.lastPlayed ? ` · ${fmt.dateShort(p.lastPlayed)}` : ''}
                </div>
              </div>
              <b className="num">{pts(p.balance)}</b>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="card tight">
            <div className="kv"><span>{t('Поставлено с основного')}</span><span>{pts(T.wagered)}</span></div>
            <div className="kv"><span>{t('Вернулось игрокам')}</span><span>{pts(T.won)}</span></div>
            <div className="kv"><span>{t('Сгорело в игре')}</span><span>{pts(T.wagered - T.won)}</span></div>
            <div className="kv"><span>{t('Бонус взяли / забрали')}</span><span>{T.bonusActivated} / {T.bonusCollected}</span></div>
            <div className="kv"><span>{t('Бонусных шайб брошено')}</span><span>{T.bonusWagered.toLocaleString('ru-RU')}</span></div>
          </div>
          <div className="section-title">{t('Что берут в магазине')}</div>
          {data.byItem.length ? (
            <div className="list">
              {data.byItem.map((i) => (
                <div key={i.item} className="row">
                  <div className="grow">
                    <div className="title">{i.title}</div>
                    <div className="meta">× {i.count}</div>
                  </div>
                  <b className="num">{pts(i.points)}</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted small">{t('Пока ничего')}</div>
          )}
          {T.bigWins.length > 0 && (
            <>
              <div className="section-title">{t('Крупные попадания (100× и выше)')}</div>
              <div className="list">
                {T.bigWins.map((w, i) => (
                  <div key={i} className="row">
                    <Avatar user={w.user} size="sm" />
                    <div className="grow">
                      <div className="title">{w.user.name}</div>
                      <div className="meta">{w.at ? fmt.dateShort(w.at) : t('дата не записана')}</div>
                    </div>
                    <b className="num">{w.multiplier}×</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Статистика нейронок: сколько постов, как оценивают (🔥 3 · 🙂 2 · 🥶 1), последние посты. */
function AiTab({ ai, onVkid, busy }: { ai: ArcadeStats['ai']; onVkid: () => void; busy: boolean }) {
  const score = (avg: number | null, votes: number) => (votes ? `${avg!.toFixed(2)} / 3 · ${votes} ${t('гол.')}` : t('нет оценок'));
  return (
    <>
      <MemoryPanel />
      <div className="card tight">
        <div className="kv"><span>GigaChat</span><span>{ai.gigachat ? t('подключён') : t('не настроен')}</span></div>
        <div className="kv"><span>{t('Сообщений в чате за сутки')}</span><span>{ai.chatToday}</span></div>
        <div className="muted small" style={{ marginTop: 6 }}>
          {t('Пишет по заказу «Респект в чате» и вечером в 20:00, если за день заказа не было (и в чате было хотя бы 10 сообщений).')}
        </div>
      </div>
      <button className="btn secondary block" disabled={busy || !ai.gigachat} onClick={onVkid}>
        🏒 {t('Вкинуть в чат сейчас')}
      </button>
      <div className="section-title">{t('По нейронкам')}</div>
      {ai.byProvider.length ? (
        <div className="list">
          {ai.byProvider.map((p) => (
            <div key={p.provider + p.model} className="row">
              <div className="grow">
                <div className="title">{PROVIDER_NAME[p.provider] ?? p.provider}</div>
                <div className="meta">{p.model ?? '—'} · {t('постов')} {p.posts} · 🔥 {p.fire}</div>
              </div>
              <b className="num">{score(p.avg, p.votes)}</b>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted small">{t('Пока ни одного поста')}</div>
      )}
      {ai.recent.length > 0 && (
        <>
          <div className="section-title">{t('Последние посты')}</div>
          <div className="list">
            {ai.recent.map((p) => (
              <div key={p.id} className="row" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="meta">
                    {PROVIDER_NAME[p.provider] ?? p.provider} · {p.kind === 'shout' ? `${t('респект')} ${p.first_name ?? ''}` : p.kind === 'troll' ? `🧌 ${t('тролль')} ${p.first_name ?? ''}` : p.kind === 'answer' ? `💬 ${t('ответ')} ${p.first_name ?? ''}` : t('вечерний вкид')} · {fmt.dateShort(p.created_at)} · {t('видел сообщений')} {p.context_n}
                  </div>
                  <div className="small" style={{ marginTop: 4 }}>{p.text}</div>
                </div>
                <b className="num">{p.votes ? `${p.avg!.toFixed(1)}` : '—'}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

type Memory = {
  facts: { id: number; fact: string; source: string | null; said_at: string | null }[];
  totalChat: number;
  unread: number;
  trolls: { order_id: number; dossier: string; anon: number; expires_at: string; last_at: string | null; target: { id: number; name: string } | null; buyer: { name: string } | null }[];
};

/** Тролли в работе и память бота: факты из чата (раз в сутки ночью), удалить ошибочное, разобрать сейчас. */
function MemoryPanel() {
  const { data, reload } = useApi<Memory>('/api/admin/ai/memory');
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<{ id: number; text: string } | null>(null);
  if (!data) return <Spinner />;
  return (
    <>
      <div className="section-title">🧌 {t('Тролли в работе')}</div>
      {data.trolls.length ? (
        <div className="list">
          {data.trolls.map((tr) => (
            <div key={tr.order_id} className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="title">{tr.target?.name ?? '—'}</div>
                <div className="meta">
                  {t('до')} {fmt.dateShort(tr.expires_at)} · {tr.anon ? t('анонимно') : `${t('заказал')} ${tr.buyer?.name ?? '—'}`}
                  {tr.last_at ? ` · ${t('последний вкид')} ${fmt.dateShort(tr.last_at)}` : ''}
                </div>
                {edit?.id === tr.order_id ? (
                  <div className="vstack" style={{ gap: 6, marginTop: 6 }}>
                    <textarea className="input" rows={4} maxLength={2000} value={edit.text} onChange={(e) => setEdit({ id: tr.order_id, text: e.target.value })} />
                    <div className="btn-row">
                      <button className="btn ghost sm" onClick={() => setEdit(null)}>
                        {t('Отмена')}
                      </button>
                      <button
                        className="btn ok sm"
                        disabled={busy || edit.text.trim().length < 3}
                        onClick={() =>
                          run(async () => {
                            await api.patch(`/api/admin/ai/trolls/${tr.order_id}`, { dossier: edit.text });
                            setEdit(null);
                            await reload();
                          }, t('Досье обновлено'))
                        }
                      >
                        {t('Сохранить')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="small" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{tr.dossier}</div>
                )}
              </div>
              {edit?.id !== tr.order_id && (
                <button className="btn ghost sm" onClick={() => setEdit({ id: tr.order_id, text: tr.dossier })}>
                  ✏️
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="muted small">{t('Сейчас никого не троллят')}</div>
      )}

      <div className="section-title">🧠 {t('Память бота')}</div>
      <div className="card tight">
        <div className="kv"><span>{t('Сообщений в журнале')}</span><span>{data.totalChat.toLocaleString('ru-RU')}</span></div>
        <div className="kv"><span>{t('Ещё не разобрано')}</span><span>{data.unread.toLocaleString('ru-RU')}</span></div>
        <div className="kv"><span>{t('Фактов')}</span><span>{data.facts.length}</span></div>
        <div className="muted small" style={{ marginTop: 6 }}>{t('Каждую ночь GigaChat читает новую переписку и выписывает полезное. Тегнули бота — отвечает по этой памяти.')}</div>
      </div>
      <button
        className="btn secondary block"
        disabled={busy || !data.unread}
        onClick={() =>
          run(async () => {
            const r = await api.post<{ added: number; dropped: number; read: number }>('/api/admin/ai/memory');
            await reload();
            toast(`${t('Прочитал')} ${r.read}, ${t('фактов')} +${r.added}${r.dropped ? ` −${r.dropped}` : ''}`);
          })
        }
      >
        🧠 {t('Разобрать чат сейчас')}
      </button>
      {data.facts.length > 0 && (
        <div className="list">
          {data.facts.map((f) => (
            <div key={f.id} className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="small">{f.fact}</div>
                <div className="meta">
                  {f.source ?? '—'}
                  {f.said_at ? ` · ${fmt.dateShort(f.said_at)}` : ''}
                </div>
              </div>
              <button
                className="btn ghost sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api.del(`/api/admin/ai/facts/${f.id}`);
                    await reload();
                  }, t('Факт удалён'))
                }
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="section-title">{t('Вкиды и оценки')}</div>
    </>
  );
}
