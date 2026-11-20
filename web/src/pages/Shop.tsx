import { t } from '@shared/i18n';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type NickStyle } from '@shared/api';
import { Avatar, Nick, Spinner, toast, toastErr, useApi, useMe } from '@shared/ui';
import { CoverEdit } from '@shared/CoverEdit';

type Item = { id: string; name: string; price: number; kind: string; hidden?: boolean; options?: string[]; period?: string };
type ArcadeState = { balance: number; items: Item[]; bought?: Record<string, number> };

const GRAD: Record<string, string> = { sunset: 'Закат', gold: 'Золото', neon: 'Неон', aurora: 'Сияние', blood: 'Кровь на льду' };
const GRAD_SWATCH: Record<string, string> = {
  sunset: 'linear-gradient(135deg,#ff6b6b,#ffa94d,#ff6bcb)',
  gold: 'linear-gradient(135deg,#b8862b,#f6dc9c,#c8963e)',
  neon: 'linear-gradient(135deg,#ff4fd8,#7b61ff,#2ec4ff)',
  aurora: 'linear-gradient(135deg,#3ddc84,#2ec4ff,#7b61ff)',
  blood: 'linear-gradient(135deg,#8b0000,#ff3b3b,#ff8a80)',
};
const FRAMES: Record<string, string> = { torch: 'Грозный факел', gold: 'Золото', ice: 'Лёд', neon: 'Неон', fire: 'Огонь', falcons: 'Falcons', rainbow: 'Радуга' };
const NICK_META: Record<string, [string, string]> = {
  'nick-grad': ['Градиентный ник', 'Переливается в составах и пятёрках · 30 дней'],
  'nick-fire': ['Огненный ник', 'Имя горит · 30 дней'],
  'nick-color': ['Цветной ник', 'Цвет на выбор · 30 дней'],
  'nick-emoji': ['Эмодзи у ника', 'Значок рядом с именем · 30 дней'],
  'shout-out': ['Респект в чате', 'Нейронка похвалит тебя в командном чате'],
};
const DEMO = { id: 88, first_name: 'Хоккеист', last_name: null, photo_url: '/demo-player.svg' };
const pts = (n: number) => `${Math.round(n * 10) / 10} ${t('очк.')}`;

/**
 * Магазин ачивок — виден всем. Ники, особые рамки (со своим фото), респект в чате, экипировка.
 * Где-то здесь лежит шайба — вход в «Ледовый дроп». Только для тех, кто найдёт.
 */
export default function Shop() {
  const { me, refresh } = useMe();
  const nav = useNavigate();
  const { data, loading, setData } = useApi<ArcadeState>('/api/arcade/state');
  const [pick, setPick] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState('torch');

  if (loading || !data) return <Spinner />;
  const items = data.items;
  const byId = (id: string) => items.find((i) => i.id === id);
  const opt = (i: Item) => pick[i.id] ?? i.options?.[0];

  const buy = async (i: Item, option?: string) => {
    setBusy(true);
    try {
      const r = await api.post<{ state: ArcadeState }>('/api/arcade/buy', { id: i.id, option });
      setData(r.state);
      setReveal(null);
      await refresh();
      if (i.id.startsWith('frame-')) toast(t('Рамка твоя! Уже горит вокруг аватарки 🔥'));
      else if (i.id === 'profile-cover') toast(t('Обложка твоя — загрузи картинку 👇'));
      else toast(i.kind === 'shout' ? t('Нейронка уже пишет тебе респект в чат 📣') : t('Готово! Уже действует — смотри профиль'));
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  };

  /** Превью: твоё имя в выбранном стиле */
  const previewStyle = (i: Item): NickStyle => {
    const o = opt(i);
    if (i.id === 'nick-grad') return { grad: o };
    if (i.id === 'nick-fire') return { fire: true };
    if (i.id === 'nick-color') return { color: o };
    if (i.id === 'nick-emoji') return { emoji: o };
    return {};
  };

  const nickCard = (i: Item) => {
    const [title, sub] = NICK_META[i.id] ?? [i.name, ''];
    const open = reveal === i.id;
    const enough = data.balance >= i.price;
    return (
      <div key={i.id} className="card ach">
        <div className="ach-preview">
          {i.kind === 'shout' ? <span style={{ fontSize: 34 }}>📣</span> : <Nick user={{ style: previewStyle(i) }} text={me.user.first_name} />}
        </div>
        <b>{t(title)}</b>
        <div className="muted small">{t(sub)}</div>
        {i.options && (
          <div className="ach-opts">
            {i.options.map((o) => (
              <button
                key={o}
                className={`ach-opt ${opt(i) === o ? 'on' : ''}`}
                style={i.id === 'nick-color' ? { background: o } : i.id === 'nick-grad' ? { background: GRAD_SWATCH[o] } : undefined}
                aria-label={GRAD[o] ?? o}
                onClick={() => setPick((p) => ({ ...p, [i.id]: o }))}
              >
                {i.id === 'nick-emoji' ? o : ''}
              </button>
            ))}
          </div>
        )}
        {open ? (
          <div className="ach-reveal">
            <div>
              {t('Цена —')} <b>{pts(i.price)}</b>. {enough ? t('Берём?') : t('Пока не хватает очков.')}
            </div>
            <div className="btn-row">
              {enough && (
                <button className="btn sm" disabled={busy} onClick={() => buy(i, opt(i))}>
                  {t('Да, беру')}
                </button>
              )}
              <button className="btn ghost sm" onClick={() => setReveal(null)}>
                {enough ? t('Нет') : t('Ок')}
              </button>
            </div>
          </div>
        ) : (
          <div className="between" style={{ marginTop: 6 }}>
            <span className="ach-price">{i.hidden ? '???' : pts(i.price)}</span>
            <button className="btn sm" disabled={busy} onClick={() => (i.hidden ? setReveal(i.id) : buy(i, opt(i)))}>
              {t('Взять')}
            </button>
          </div>
        )}
      </div>
    );
  };

  const month = byId('frame-month');
  const season = byId('frame-season');
  const nicks = items.filter((i) => i.id.startsWith('nick-') || i.kind === 'shout');
  const cover = byId('profile-cover');
  const coverOn = !!me.user.style?.cover;
  const gear = items.filter((i) => i.kind === 'physical' || i.kind === 'voucher').sort((a, b) => a.price - b.price);

  return (
    <div className="page">
      <div className="shop-hero">
        <div>
          <div className="shop-eyebrow">FALCONS · {t('АЧИВКИ')}</div>
          <h1>{t('Магазин ачивок')}</h1>
          <div className="shop-bal">
            {t('Твои очки')}: <b>{pts(data.balance)}</b>
          </div>
          <div className="shop-sub">{t('Очки дают за голы. Ачивки меняются с разной периодичностью — одни уходят через неделю, другие держатся сезон.')}</div>
        </div>
        {/* шайба: вход в «Ледовый дроп» — только для тех, кто заметит */}
        <button className="secret-puck" aria-label={t('Шайба')} onClick={() => nav('/rink')} />
      </div>

      <div className="section-title">{t('Ачивки · цены — секрет')}</div>
      <div className="ach-grid">{nicks.map(nickCard)}</div>

      {cover && (
        <>
          <div className="section-title">{t('Обложка профиля')}</div>
          <div className="card frame-card">
            <div className="cover-demo">
              <div className="profile-cover" style={{ backgroundImage: `url(${me.user.cover_url || '/demo-cover.svg'})` }} />
              <Avatar user={me.user} size="lg" />
              <Nick user={me.user} text={me.user.name} />
            </div>
            <div className="muted small">
              {t('Любая картинка над твоим профилем, а сверху — твоя аватарка. Хоть кадр из любимого мультика про хоккей.')}
            </div>
            {coverOn ? (
              <CoverEdit onDone={refresh} label={me.user.cover_url ? t('Сменить обложку') : t('Загрузить обложку')} />
            ) : reveal === cover.id ? (
              <div className="ach-reveal">
                <div>
                  {t('Цена —')} <b>{pts(cover.price)}</b> {t('на месяц.')} {data.balance >= cover.price ? t('Берём?') : t('Пока не хватает очков.')}
                </div>
                <div className="btn-row">
                  {data.balance >= cover.price && (
                    <button className="btn sm" disabled={busy} onClick={() => buy(cover)}>
                      {t('Да, беру')}
                    </button>
                  )}
                  <button className="btn ghost sm" onClick={() => setReveal(null)}>
                    {t('Нет')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="between">
                <span className="ach-price">{cover.hidden ? '???' : pts(cover.price)}</span>
                <button className="btn sm" disabled={busy} onClick={() => (cover.hidden ? setReveal(cover.id) : buy(cover))}>
                  {t('Взять')}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {(month || season) && (
        <>
          <div className="section-title">{t('Особые рамки')}</div>
          <div className="card frame-card">
            <div className="frame-demo">
              <Avatar user={{ ...DEMO, style: { frame } }} size="lg" />
              <div>
                <b>{t('Рамка вокруг твоей аватарки')}</b>
                <div className="muted small">{t('Переливается и светится — как у этого красавца. Видна всем: в составах, пятёрках и профиле.')}</div>
              </div>
            </div>
            <div className="ach-opts" style={{ justifyContent: 'center' }}>
              {Object.keys(FRAMES).map((f) => (
                <button key={f} className={`frame-opt ${frame === f ? 'on' : ''}`} onClick={() => setFrame(f)} aria-label={FRAMES[f]}>
                  <Avatar user={{ ...DEMO, style: { frame: f } }} size="sm" />
                </button>
              ))}
            </div>
            <div className="center small muted">{t(FRAMES[frame])}</div>
            <div className="frame-buy">
              {month && (
                <button className="btn secondary" disabled={busy || data.balance < month.price} onClick={() => buy(month, frame)}>
                  {t('Месяц')} · {pts(month.price)}
                </button>
              )}
              {season && (
                <button className="btn secondary" disabled={busy || data.balance < season.price} onClick={() => buy(season, frame)}>
                  {t('До конца сезона')} · {pts(season.price)}
                </button>
              )}
              <button className="btn frame-forever" onClick={() => nav('/frame-forever')}>
                💎 {t('Навсегда')} · X ₾
              </button>
            </div>
          </div>
        </>
      )}

      {gear.length > 0 && (
        <>
          <div className="section-title">{t('Экипировка')}</div>
          <div className="list">
            {gear.map((i) => (
              <div key={i.id} className="row">
                <div className="grow">
                  <div className="title">{t(i.name)}</div>
                  <div className="meta">{pts(i.price)}</div>
                </div>
                <button className="btn sm" disabled={busy || data.balance < i.price} onClick={() => buy(i)}>
                  {data.balance < i.price ? t('Копим') : t('Взять')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
}
