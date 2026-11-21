import { useState } from 'react';
import { api } from '@shared/api';
import { fmt } from '@shared/format';
import { ShopAdmin } from '@shared/ShopAdmin';
import { GrantPoints } from '@shared/GrantPoints';
import { ORDER_STATUS, PROVIDER_NAME, pts, type ArcadeStats } from '@shared/arcadeStats';
import { ask, Avatar, Nick, ProofImage, Segmented, Spinner, useAction, useApi } from '@shared/ui';
import Drawer from '../Drawer';

/** Консоль: аналитика «Ледового дропа» и заказы из магазина. */
export default function ArcadeAdmin() {
  const { data, loading, reload } = useApi<ArcadeStats>('/api/admin/arcade');
  const [tab, setTab] = useState<'orders' | 'shop' | 'grant' | 'players' | 'items' | 'ai'>('orders');
  const { busy, run } = useAction();
  const [proof, setProof] = useState<string | null>(null);
  if (loading || !data) return <Spinner />;
  const T = data.totals;
  const setStatus = (id: number, status: 'issued' | 'cancelled' | 'approved', ok: string) =>
    run(async () => {
      await api.patch(`/api/admin/prizes/${id}`, { status });
      await reload();
    }, ok);
  const kpis: [string, string][] = [
    [String(T.players), `играют · ${T.active7} за 7 дней`],
    [pts(T.goals), 'выдано за голы'],
    [pts(T.balances), 'на руках у игроков'],
    [pts(T.spent), 'потрачено в магазине'],
    [T.drops.toLocaleString('ru-RU'), 'бросков'],
    [pts(T.wagered), 'поставлено с основного'],
    [pts(T.won), 'вернулось игрокам'],
    [T.rtp == null ? '—' : `${(T.rtp * 100).toFixed(1)}%`, 'фактический возврат (теория 97%)'],
    [`${T.bonusActivated} / ${T.bonusCollected}`, 'бонус взяли / забрали'],
    [String(T.toIssue), 'призов ждут выдачи'],
  ];

  return (
    <div className="cpage">
      <div className="c-head">
        <div>
          <h1>Игра и магазин</h1>
          <div className="sub">«Ледовый дроп»: очки за голы, броски, призы</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
        {kpis.map(([v, l]) => (
          <div key={l} className="c-card pad">
            <div style={{ fontSize: 24, fontWeight: 800 }} className="num">
              {v}
            </div>
            <div className="muted small">{l}</div>
          </div>
        ))}
      </div>
      <div className="c-bar">
        <div style={{ width: 660 }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              ['orders', `Заказы · ${T.orders}`],
              ['shop', 'Магазин'],
              ['grant', 'Начислить'],
              ['players', `Игроки · ${T.players}`],
              ['items', 'Призы'],
              ['ai', 'Нейронки'],
            ]}
          />
        </div>
      </div>
      <div className="tbl-wrap">
        {tab === 'shop' ? (
          <div style={{ padding: 16, maxWidth: 760 }}>
            <ShopAdmin />
          </div>
        ) : tab === 'grant' ? (
          <div style={{ padding: 16, maxWidth: 560 }}>
            <GrantPoints data={data} onDone={reload} />
          </div>
        ) : tab === 'ai' ? (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="hstack" style={{ gap: 12, flexWrap: 'wrap' }}>
              <span className={`chip ${data.ai.gigachat ? 'ok' : 'warn'}`}>GigaChat: {data.ai.gigachat ? 'подключён' : 'не настроен'}</span>
              <span className="muted small">сообщений в чате за сутки: {data.ai.chatToday}</span>
              <button
                className="btn secondary sm"
                disabled={busy || !data.ai.gigachat}
                onClick={() => run(async () => { await api.post('/api/admin/ai/vkid'); await reload(); }, 'Вкид отправлен в чат')}
              >
                🏒 Вкинуть в чат сейчас
              </button>
            </div>
            <table className="tbl">
              <thead><tr><th>Нейронка</th><th>Модель</th><th>Постов</th><th>Голосов</th><th>🔥</th><th>Средняя (из 3)</th></tr></thead>
              <tbody>
                {data.ai.byProvider.map((p) => (
                  <tr key={p.provider + p.model}>
                    <td><b>{PROVIDER_NAME[p.provider] ?? p.provider}</b></td>
                    <td className="muted">{p.model ?? '—'}</td>
                    <td className="num">{p.posts}</td>
                    <td className="num">{p.votes}</td>
                    <td className="num">{p.fire}</td>
                    <td className="num">{p.votes ? p.avg!.toFixed(2) : '—'}</td>
                  </tr>
                ))}
                {!data.ai.byProvider.length && <tr><td colSpan={6} className="muted center" style={{ padding: 24 }}>Пока ни одного поста</td></tr>}
              </tbody>
            </table>
            <table className="tbl">
              <thead><tr><th>Когда</th><th>Кто</th><th>Что</th><th>Текст</th><th>Видел сообщений</th><th>Оценка</th></tr></thead>
              <tbody>
                {data.ai.recent.map((p) => (
                  <tr key={p.id}>
                    <td className="muted">{fmt.dateShort(p.created_at)}, {fmt.time(p.created_at)}</td>
                    <td>{PROVIDER_NAME[p.provider] ?? p.provider}</td>
                    <td className="muted">{p.kind === 'shout' ? `респект ${p.first_name ?? ''}` : 'вечерний вкид'}</td>
                    <td style={{ maxWidth: 520, whiteSpace: 'normal' }}>{p.text}</td>
                    <td className="num">{p.context_n}</td>
                    <td className="num">{p.votes ? `${p.avg!.toFixed(1)} · ${p.votes}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === 'orders' ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Игрок</th>
                <th>Приз</th>
                <th>Очки</th>
                <th>Когда</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div className="player">
                      <Avatar user={o.user} size="sm" />
                      <Nick user={o.user} text={o.user.name} />
                    </div>
                  </td>
                  <td>
                    {o.title}
                    {o.option ? <span className="muted"> · {o.option}</span> : null}
                  </td>
                  <td className="num">{o.currency === 'gel' ? `${o.price} ₾` : pts(o.price)}</td>
                  <td className="muted">
                    {fmt.dateShort(o.created_at)}, {fmt.time(o.created_at)}
                    {o.expires_at ? ` · до ${fmt.dateShort(o.expires_at)}` : ''}
                  </td>
                  <td>
                    <span className={`chip ${ORDER_STATUS[o.status]?.[1] ?? ''}`}>{ORDER_STATUS[o.status]?.[0] ?? o.status}</span>
                  </td>
                  <td>
                    <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      {o.status === 'new' && (
                        <button className="btn ok xs" disabled={busy} onClick={() => setStatus(o.id, 'issued', 'Отмечено: выдан')}>
                          Выдал
                        </button>
                      )}
                      {o.status === 'awaiting' && o.proof && (
                        <button className="btn ghost xs" onClick={() => setProof(o.proof!)}>
                          Скрин
                        </button>
                      )}
                      {o.status === 'awaiting' && (
                        <button className="btn ok xs" disabled={busy} onClick={() => setStatus(o.id, 'approved', 'Рамка включена навсегда')}>
                          Деньги пришли
                        </button>
                      )}
                      {(o.status === 'new' || o.status === 'awaiting' || (o.status === 'active' && o.kind !== 'shout')) && (
                        <button
                          className="btn bad-soft xs"
                          disabled={busy}
                          onClick={async () =>
                            (await ask('Отменить заказ? Очки вернутся игроку.', { okText: 'Отменить заказ', danger: true })) &&
                            setStatus(o.id, 'cancelled', 'Отменено, очки вернулись')
                          }
                        >
                          Отменить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!data.orders.length && (
                <tr>
                  <td colSpan={6} className="muted center" style={{ padding: 24 }}>
                    Заказов пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : tab === 'players' ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Игрок</th>
                <th>Баланс</th>
                <th>Голов</th>
                <th>Бросков</th>
                <th>Поставил</th>
                <th>Вернулось</th>
                <th>Возврат</th>
                <th>Бонус</th>
                <th>В магазине</th>
                <th>Играл</th>
              </tr>
            </thead>
            <tbody>
              {data.players.map((p) => (
                <tr key={p.user.id}>
                  <td>
                    <div className="player">
                      <Avatar user={p.user} size="sm" />
                      <Nick user={p.user} text={p.user.name} />
                    </div>
                  </td>
                  <td className="num"><b>{pts(p.balance)}</b></td>
                  <td className="num">{p.goals}</td>
                  <td className="num">{p.drops}</td>
                  <td className="num">{pts(p.wagered)}</td>
                  <td className="num">{pts(p.won)}</td>
                  <td className="num">{p.wagered ? `${((p.won / p.wagered) * 100).toFixed(0)}%` : '—'}</td>
                  <td className="muted">{p.bonus.collected ? 'забрал' : p.bonus.status === 'available' ? '—' : `${p.bonus.played}/500`}</td>
                  <td className="num">{p.spent ? `${pts(p.spent)} · ${p.purchases}` : '—'}</td>
                  <td className="muted">{p.lastPlayed ? fmt.dateShort(p.lastPlayed) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Приз</th>
                <th>Взяли раз</th>
                <th>Очков потрачено</th>
              </tr>
            </thead>
            <tbody>
              {data.byItem.map((i) => (
                <tr key={i.item}>
                  <td>{i.title}</td>
                  <td className="num">{i.count}</td>
                  <td className="num">{pts(i.points)}</td>
                </tr>
              ))}
              {!data.byItem.length && (
                <tr>
                  <td colSpan={3} className="muted center" style={{ padding: 24 }}>
                    Пока ничего не брали
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <Drawer open={!!proof} onClose={() => setProof(null)} title="Скрин оплаты">
        {proof && <ProofImage name={proof} />}
      </Drawer>
    </div>
  );
}
