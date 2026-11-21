import { t } from '@shared/i18n';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type NickStyle } from '@shared/api';
import { ask, Avatar, Nick, Spinner, toast, toastErr, useApi, useMe } from '@shared/ui';
import { CoverEdit } from '@shared/CoverEdit';

type Item = { id: string; name: string; price: number; weekPrice?: number; kind: string; hidden?: boolean; options?: string[]; period?: string };
type ArcadeState = { balance: number; items: Item[]; bought?: Record<string, number> };
type Term = { key: string; label: string; price: number; term?: 'week'; best?: boolean; item: Item };

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
  'nick-grad': ['Градиентный ник', 'Переливается в составах и пятёрках'],
  'nick-fire': ['Огненный ник', 'Имя горит живым огнём'],
  'nick-color': ['Цветной ник', 'Свой цвет имени'],
  'nick-emoji': ['Эмодзи у ника', 'Значок рядом с именем'],
  'shout-out': ['Респект в чате', 'Нейронка похвалит тебя в командном чате'],
};
const DEMO = { id: 88, first_name: 'Хоккеист', last_name: null, photo_url: '/demo-player.svg' };
const num = (n: number) => (Math.round(n * 10) / 10).toLocaleString('ru-RU');
const pts = (n: number) => `${num(n)} ${t('очк.')}`;

/** Сроки ачивки: неделя (если есть) и месяц; у остального — одна цена. */
function termsOf(i: Item | undefined): Term[] {
  if (!i) return [];
  const out: Term[] = [];
  if (i.weekPrice) out.push({ key: 'week', label: t('Неделя'), price: i.weekPrice, term: 'week', item: i });
  const label = i.period === 'season' ? t('Сезон') : i.period === 'month' ? t('Месяц') : i.kind === 'shout' ? t('Разово') : t('Цена');
  out.push({ key: i.id, label, price: i.price, item: i, best: !!i.weekPrice && i.price < i.weekPrice * 4 });
  return out;
}

/**
 * Магазин ачивок — виден всем. Цены видны сразу; у ачивок на месяц есть вариант на неделю.
 * Где-то здесь лежит шайба — вход в «Ледовый дроп». Только для тех, кто найдёт.
 */
export default function Shop() {
  const { me, refresh } = useMe();
  const nav = useNavigate();
  const { data, loading, setData } = useApi<ArcadeState>('/api/arcade/state');
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState('torch');

  if (loading || !data) return <Spinner />;
  const items = data.items;
  const byId = (id: string) => items.find((i) => i.id === id);
  const opt = (i: Item) => pick[i.id] ?? i.options?.[0];

  const buy = async (tm: Term, option: string | undefined, what: string) => {
    const i = tm.item;
    const period = tm.term === 'week' ? t('на неделю') : i.period === 'season' ? t('до конца сезона') : i.period === 'month' ? t('на месяц') : '';
    const okay = await ask(`${what}${period ? ` ${period}` : ''} — ${pts(tm.price)}`, { okText: `${t('Беру')} · ${pts(tm.price)}` });
    if (!okay) return;
    setBusy(true);
    try {
      const r = await api.post<{ state: ArcadeState }>('/api/arcade/buy', { id: i.id, option, ...(tm.term ? { term: tm.term } : {}) });
      setData(r.state);
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

  /** Ценник: срок сверху, крупная цифра, «очк.»; не хватает — тусклый, со сколько ещё. */
  const tags = (terms: Term[], option: string | undefined, what: string, extra?: ReactNode) => (
    <div className={`lux-tags n${terms.length + (extra ? 1 : 0)}`}>
      {terms.map((tm) => {
        const short = Math.max(0, tm.price - data.balance);
        const secret = tm.item.hidden && !tm.term;
        return (
          <button key={tm.key} className={`lux-tag ${tm.best ? 'best' : ''} ${short ? 'short' : ''}`} disabled={busy || short > 0} onClick={() => buy(tm, option, what)}>
            {tm.best && <span className="lux-ribbon">{t('выгоднее')}</span>}
            <span className="lux-term">{tm.label}</span>
            <span className="lux-val">
              {secret ? '???' : num(tm.price)}
              <small>{t('очк.')}</small>
            </span>
            {short > 0 && !secret && <span className="lux-short">{t('ещё')} {num(Math.ceil(short))}</span>}
          </button>
        );
      })}
      {extra}
    </div>
  );

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
    return (
      <div key={i.id} className="lux-card">
        <div className="lux-stage">
          {i.kind === 'shout' ? <span style={{ fontSize: 34 }}>📣</span> : <Nick user={{ style: previewStyle(i) }} text={me.user.first_name} />}
        </div>
        <div className="lux-body">
          <div className="lux-title">{t(title)}</div>
          <div className="lux-sub">{t(sub)}</div>
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
          {tags(termsOf(i), opt(i), `«${t(title)}»`)}
        </div>
      </div>
    );
  };

  const month = byId('frame-month');
  const season = byId('frame-season');
  const nicks = items.filter((i) => i.id.startsWith('nick-') || i.kind === 'shout');
  const cover = byId('profile-cover');
  const coverOn = !!me.user.style?.cover;
  const gear = items.filter((i) => i.kind === 'physical' || i.kind === 'voucher').sort((a, b) => a.price - b.price);
  const frameTerms = [...termsOf(month), ...termsOf(season).map((x) => ({ ...x, best: false }))];

  return (
    <div className="page">
      <div className="shop-hero">
        <div>
          <div className="shop-eyebrow">FALCONS · {t('АЧИВКИ')}</div>
          <h1>{t('Магазин ачивок')}</h1>
          <div className="shop-bal-pill">
            <span>{t('Твои очки')}</span>
            <b>{num(data.balance)}</b>
          </div>
          <div className="shop-sub">{t('Очки дают за голы. Ачивки меняются с разной периодичностью — одни уходят через неделю, другие держатся сезон.')}</div>
        </div>
        {/* шайба: вход в «Ледовый дроп» — только для тех, кто заметит */}
        <button className="secret-puck" aria-label={t('Шайба')} onClick={() => nav('/rink')} />
      </div>

      <div className="section-title">{t('Ачивки')}</div>
      <div className="ach-grid">{nicks.map(nickCard)}</div>

      {cover && (
        <>
          <div className="section-title">{t('Обложка профиля')}</div>
          <div className="lux-card wide">
            <div className="cover-demo">
              <div className="profile-cover" style={{ backgroundImage: `url(${me.user.cover_url || '/demo-cover.svg'})` }} />
              <Avatar user={me.user} size="lg" />
              <Nick user={me.user} text={me.user.name} />
            </div>
            <div className="lux-body">
              <div className="lux-sub">{t('Любая картинка над твоим профилем, а сверху — твоя аватарка. Хоть кадр из любимого мультика про хоккей.')}</div>
              {coverOn && <CoverEdit onDone={refresh} label={me.user.cover_url ? t('Сменить обложку') : t('Загрузить обложку')} />}
              {tags(termsOf(cover), undefined, coverOn ? t('Продлить обложку') : t('Обложка профиля'))}
            </div>
          </div>
        </>
      )}

      {(month || season) && (
        <>
          <div className="section-title">{t('Особые рамки')}</div>
          <div className="lux-card wide">
            <div className="lux-stage frame-stage">
              <Avatar user={{ ...DEMO, style: { frame } }} size="lg" />
              <div>
                <div className="lux-title light">{t(FRAMES[frame])}</div>
                <div className="lux-sub light">{t('Переливается и светится вокруг аватарки. Видна всем: в составах, пятёрках и профиле.')}</div>
              </div>
            </div>
            <div className="lux-body">
              <div className="ach-opts" style={{ justifyContent: 'center' }}>
                {Object.keys(FRAMES).map((f) => (
                  <button key={f} className={`frame-opt ${frame === f ? 'on' : ''}`} onClick={() => setFrame(f)} aria-label={FRAMES[f]}>
                    <Avatar user={{ ...DEMO, style: { frame: f } }} size="sm" />
                  </button>
                ))}
              </div>
              {tags(
                frameTerms,
                frame,
                `${t('Рамка')} «${t(FRAMES[frame])}»`,
                <button className="lux-tag forever" onClick={() => nav('/frame-forever')}>
                  <span className="lux-term">💎 {t('Навсегда')}</span>
                  <span className="lux-val">
                    X<small>₾</small>
                  </span>
                </button>,
              )}
            </div>
          </div>
        </>
      )}

      {gear.length > 0 && (
        <>
          <div className="section-title">{t('Экипировка')}</div>
          <div className="vstack" style={{ gap: 10 }}>
            {gear.map((i) => (
              <div key={i.id} className="lux-card row-card">
                <div className="lux-body grow">
                  <div className="lux-title">{t(i.name)}</div>
                  <div className="lux-sub">{i.kind === 'voucher' ? t('Потратишь во вкладке «Заточка»') : t('Выдаст админ лично')}</div>
                </div>
                {tags(termsOf(i), undefined, `«${t(i.name)}»`)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
