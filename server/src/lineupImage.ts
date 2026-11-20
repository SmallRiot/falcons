/**
 * Пятёрки картинкой: хоккейная площадка сверху, тёмные — в левой зоне, светлые — в правой.
 * У каждой позиции карточка со звеньями (1–4). SVG → PNG через resvg, шрифт DejaVu (кириллица) из npm.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
const fontDir = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const FONTS = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSansCondensed.ttf', 'DejaVuSansCondensed-Bold.ttf'].map((f) =>
  path.join(fontDir, f),
);
const LOGO = `data:image/png;base64,${readFileSync(path.resolve(import.meta.dirname, '../../web/public/logo.png')).toString('base64')}`;

export interface Slot {
  user_id: number;
  team: string; // '' | dark | light
  line: number; // 0 — вратари
  slot: string; // LW C RW LD RD G1 G2
  name: string; // «Никита К.»
  number: number | null;
}

const W = 1600;
const H = 960;
const TOP = 110; // площадка начинается ниже шапки
const RINK_H = 820;
const CY = TOP + RINK_H / 2;
const LINE_COLORS = ['#2b88cf', '#1f9d6b', '#e0a21b', '#8a4fd8'];
const GOLD = '#f5b700';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Разметка катка: борта, синие и красные линии, круги вбрасывания, ворота, логотип в центре. */
function rink() {
  const x0 = 40;
  const x1 = W - 40;
  const y0 = TOP;
  const y1 = TOP + RINK_H;
  const goalX = [x0 + 90, x1 - 90];
  const blue = [W / 2 - 250, W / 2 + 250];
  const circles = [
    [x0 + 270, CY - 210],
    [x0 + 270, CY + 210],
    [x1 - 270, CY - 210],
    [x1 - 270, CY + 210],
  ];
  return `
  <defs>
    <clipPath id="ice"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${RINK_H}" rx="170"/></clipPath>
    <linearGradient id="iceg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f7fbfe"/><stop offset="1" stop-color="#e8f1f8"/>
    </linearGradient>
  </defs>
  <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${RINK_H}" rx="170" fill="url(#iceg)"/>
  <g clip-path="url(#ice)" fill="none">
    ${goalX.map((x) => `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="#e05555" stroke-width="3" opacity=".7"/>`).join('')}
    ${blue.map((x) => `<rect x="${x - 7}" y="${y0}" width="14" height="${RINK_H}" fill="#2b88cf" opacity=".85"/>`).join('')}
    <rect x="${W / 2 - 6}" y="${y0}" width="12" height="${RINK_H}" fill="#e05555" opacity=".8"/>
    <circle cx="${W / 2}" cy="${CY}" r="96" stroke="#2b88cf" stroke-width="4"/>
    ${circles.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="86" stroke="#e05555" stroke-width="3" opacity=".55"/><circle cx="${x}" cy="${y}" r="7" fill="#e05555" opacity=".6"/>`).join('')}
    <path d="M ${goalX[0]} ${CY - 46} A 46 46 0 0 1 ${goalX[0]} ${CY + 46} Z" fill="#9fd0f2" opacity=".55" stroke="#e05555" stroke-width="2"/>
    <path d="M ${goalX[1]} ${CY - 46} A 46 46 0 0 0 ${goalX[1]} ${CY + 46} Z" fill="#9fd0f2" opacity=".55" stroke="#e05555" stroke-width="2"/>
    <rect x="${goalX[0] - 22}" y="${CY - 22}" width="22" height="44" fill="#e05555" opacity=".35"/>
    <rect x="${goalX[1]}" y="${CY - 22}" width="22" height="44" fill="#e05555" opacity=".35"/>
  </g>
  <image href="${LOGO}" x="${W / 2 - 78}" y="${CY - 78}" width="156" height="156" opacity=".22"/>
  <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${RINK_H}" rx="170" fill="none" stroke="#0d1f2d" stroke-width="10"/>`;
}

interface CardOpts {
  x: number; // центр
  y: number; // центр
  w: number;
  label: string;
  rows: { line: number; name: string; number: number | null; me: boolean }[];
  dark: boolean;
}

/** Карточка позиции: заголовок «ЛН» и строки звеньев с цветной цифрой. */
function card({ x, y, w, label, rows, dark }: CardOpts) {
  const rowH = 40;
  const headH = 34;
  const h = headH + Math.max(1, rows.length) * rowH + 8;
  const left = x - w / 2;
  const top = y - h / 2;
  const bg = dark ? '#0d1f2d' : '#ffffff';
  const fg = dark ? '#ffffff' : '#0d1f2d';
  const sub = dark ? '#8fb3cc' : '#6f8696';
  const body = rows.length
    ? rows
        .map((r, i) => {
          const ry = top + headH + i * rowH;
          const color = r.line === 0 ? '#5b6b78' : LINE_COLORS[(r.line - 1) % LINE_COLORS.length];
          return `
      ${r.me ? `<rect x="${left + 6}" y="${ry + 2}" width="${w - 12}" height="${rowH - 4}" rx="10" fill="${GOLD}"/>` : ''}
      <circle cx="${left + 26}" cy="${ry + rowH / 2}" r="13" fill="${color}"/>
      <text x="${left + 26}" y="${ry + rowH / 2 + 6}" font-family="DejaVu Sans" font-weight="bold" font-size="16" fill="#fff" text-anchor="middle">${r.line === 0 ? 'В' : r.line}</text>
      <text x="${left + 48}" y="${ry + rowH / 2 + 7}" font-family="DejaVu Sans Condensed" font-weight="bold" font-size="21" fill="${r.me ? '#0d1f2d' : fg}">${esc(cut(r.name, 15))}</text>
      ${r.number != null ? `<text x="${left + w - 12}" y="${ry + rowH / 2 + 6}" font-family="DejaVu Sans Condensed" font-size="16" fill="${r.me ? '#0d1f2d' : sub}" text-anchor="end">#${r.number}</text>` : ''}`;
        })
        .join('')
    : `<text x="${x}" y="${top + headH + 26}" font-family="DejaVu Sans" font-size="18" fill="${sub}" text-anchor="middle">—</text>`;
  return `
  <g>
    <rect x="${left}" y="${top + 4}" width="${w}" height="${h}" rx="16" fill="#0d1f2d" opacity=".18"/>
    <rect x="${left}" y="${top}" width="${w}" height="${h}" rx="16" fill="${bg}" stroke="${dark ? '#0d1f2d' : '#c9d8e3'}" stroke-width="2"/>
    <text x="${left + 16}" y="${top + 24}" font-family="DejaVu Sans" font-weight="bold" font-size="15" letter-spacing="2" fill="${sub}">${esc(label)}</text>
    ${body}
  </g>`;
}

const POS_LABEL: Record<string, string> = { LW: 'ЛЕВЫЙ НАП.', C: 'ЦЕНТР', RW: 'ПРАВЫЙ НАП.', LD: 'ЛЕВЫЙ ЗАЩ.', RD: 'ПРАВЫЙ ЗАЩ.', G: 'ВРАТАРИ' };

/**
 * Расстановка одной команды в своей половине. side = 'left' — защищает левые ворота и атакует вправо.
 * Если смотреть сверху и команда атакует вправо, её левый фланг — сверху.
 */
function teamSide(slots: Slot[], side: 'left' | 'right', dark: boolean, highlight?: number) {
  const mirror = (x: number) => (side === 'left' ? x : W - x);
  const flip = (y: number) => (side === 'left' ? y : 2 * CY - y); // у команды справа левый фланг снизу
  const rowsFor = (pos: string) =>
    slots
      .filter((s) => (pos === 'G' ? s.line === 0 : s.slot === pos && s.line > 0))
      .sort((a, b) => a.line - b.line || a.slot.localeCompare(b.slot))
      .map((s) => ({ line: s.line, name: s.name, number: s.number, me: s.user_id === highlight }));
  return [
    card({ x: mirror(185), y: CY, w: 230, label: POS_LABEL.G, rows: rowsFor('G'), dark }),
    card({ x: mirror(398), y: flip(CY - 165), w: 240, label: POS_LABEL.LD, rows: rowsFor('LD'), dark }),
    card({ x: mirror(398), y: flip(CY + 165), w: 240, label: POS_LABEL.RD, rows: rowsFor('RD'), dark }),
    card({ x: mirror(650), y: flip(CY - 245), w: 240, label: POS_LABEL.LW, rows: rowsFor('LW'), dark }),
    card({ x: mirror(650), y: CY, w: 240, label: POS_LABEL.C, rows: rowsFor('C'), dark }),
    card({ x: mirror(650), y: flip(CY + 245), w: 240, label: POS_LABEL.RW, rows: rowsFor('RW'), dark }),
  ].join('');
}

export interface LineupImageInput {
  title: string; // «ТРЕНИРОВКА · ЧТ 21 НОЯБРЯ · 21:30»
  slots: Slot[];
  highlightUserId?: number;
  opponent?: string | null; // для игры одним составом — подпись справа
}

export function renderLineupPng(input: LineupImageInput): Buffer {
  const { slots, highlightUserId } = input;
  const split = slots.some((s) => s.team === 'dark' || s.team === 'light');
  const header = `
  <rect width="${W}" height="${H}" fill="#eef3f7"/>
  <image href="${LOGO}" x="40" y="14" width="80" height="80"/>
  <text x="136" y="52" font-family="DejaVu Sans" font-weight="bold" font-size="34" fill="#0d1f2d">ПЯТЁРКИ</text>
  <text x="136" y="86" font-family="DejaVu Sans" font-size="22" fill="#4a6273">${esc(input.title)}</text>
  ${
    split
      ? `<g font-family="DejaVu Sans" font-weight="bold" font-size="22">
          <rect x="${W - 520}" y="34" width="220" height="48" rx="24" fill="#0d1f2d"/>
          <text x="${W - 410}" y="66" fill="#fff" text-anchor="middle">ТЁМНЫЕ ◀</text>
          <rect x="${W - 280}" y="34" width="240" height="48" rx="24" fill="#fff" stroke="#0d1f2d" stroke-width="2"/>
          <text x="${W - 160}" y="66" fill="#0d1f2d" text-anchor="middle">▶ СВЕТЛЫЕ</text>
        </g>`
      : ''
  }`;
  let body: string;
  if (split) {
    body = teamSide(slots.filter((s) => s.team === 'dark'), 'left', true, highlightUserId) +
      teamSide(slots.filter((s) => s.team === 'light'), 'right', false, highlightUserId);
  } else {
    body = teamSide(slots, 'left', true, highlightUserId);
    if (input.opponent)
      body += `<text x="${W - 420}" y="${CY - 10}" font-family="DejaVu Sans" font-size="26" fill="#6f8696" text-anchor="middle">соперник</text>
        <text x="${W - 420}" y="${CY + 36}" font-family="DejaVu Sans" font-weight="bold" font-size="40" fill="#0d1f2d" text-anchor="middle">${esc(cut(input.opponent, 22))}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${header}${rink()}${body}</svg>`;
  return new Resvg(svg, {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans' },
    fitTo: { mode: 'width', value: W },
  })
    .render()
    .asPng();
}
