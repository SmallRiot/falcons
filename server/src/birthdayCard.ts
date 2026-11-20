/** Открытка «С днём рождения» для командного чата: SVG → PNG, фирменные цвета и логотип. */
import { Resvg } from '@resvg/resvg-js';
import { FONTS, LOGO } from './lineupImage.ts';

const W = 1280;
const H = 720;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Конфетти — детерминированно от имени, чтобы картинка не прыгала между перерисовками. */
function confetti(seed: string) {
  let x = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const colors = ['#ffffff', '#f5b700', '#a3bccc', '#9fd0f2', '#ffd6e0'];
  let out = '';
  for (let i = 0; i < 70; i++) {
    const cx = rnd() * W;
    const cy = rnd() * H;
    if (cx > 180 && cx < W - 180 && cy > 220 && cy < 540) continue; // не сыпем на текст
    const c = colors[Math.floor(rnd() * colors.length)];
    const r = 4 + rnd() * 8;
    out +=
      rnd() > 0.5
        ? `<circle cx="${cx}" cy="${cy}" r="${r / 1.6}" fill="${c}" opacity="${0.35 + rnd() * 0.5}"/>`
        : `<rect x="${cx}" y="${cy}" width="${r * 1.6}" height="${r / 1.4}" rx="2" fill="${c}" opacity="${0.35 + rnd() * 0.5}" transform="rotate(${rnd() * 180} ${cx} ${cy})"/>`;
  }
  return out;
}

export function renderBirthdayPng(people: { name: string; number: number | null }[]): Buffer {
  const names = people.slice(0, 4);
  const big = names.length === 1;
  const lineH = big ? 92 : 64;
  const startY = 420 - ((names.length - 1) * lineH) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1c6aa8"/><stop offset=".55" stop-color="#2b88cf"/><stop offset="1" stop-color="#5aa6dc"/>
    </linearGradient>
    <pattern id="tri" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M0 44 L22 22 L22 44Z M22 22 L44 0 L44 22Z" fill="#ffffff" opacity=".09"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#tri)"/>
  ${confetti(names.map((n) => n.name).join())}
  <rect x="${W / 2 - 74}" y="44" width="148" height="148" rx="36" fill="#fff"/>
  <image href="${LOGO}" x="${W / 2 - 64}" y="54" width="128" height="128"/>
  <text x="${W / 2}" y="270" font-family="DejaVu Sans" font-weight="bold" font-size="30" letter-spacing="8" fill="#ffffff" opacity=".85" text-anchor="middle">FALCONS ПОЗДРАВЛЯЕТ</text>
  <text x="${W / 2}" y="${big ? 345 : 330}" font-family="DejaVu Sans" font-weight="bold" font-size="${big ? 66 : 54}" fill="#ffffff" text-anchor="middle">С ДНЁМ РОЖДЕНИЯ!</text>
  ${names
    .map(
      (p, i) =>
        `<text x="${W / 2}" y="${startY + (big ? 70 : 60) + i * lineH}" font-family="DejaVu Sans Condensed" font-weight="bold" font-size="${big ? 76 : 52}" fill="#f5b700" text-anchor="middle">${esc(p.name)}${p.number != null ? ` <tspan fill="#ffffff" opacity=".8" font-size="${big ? 52 : 38}">#${p.number}</tspan>` : ''}</text>`,
    )
    .join('')}
  <text x="${W / 2}" y="${H - 44}" font-family="DejaVu Sans" font-size="26" fill="#ffffff" opacity=".85" text-anchor="middle">острых коньков, лёгких шайб и побед на льду</text>
</svg>`;
  return new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans' } }).render().asPng();
}
