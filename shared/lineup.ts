import type { LineupItem, PublicUser, Team } from './api';

export const FWD = ['LW', 'C', 'RW'] as const;
export const DEF = ['LD', 'RD'] as const;
export const GOALIES = ['G1', 'G2'] as const;
export const SLOT_LABEL: Record<string, string> = { LW: 'ЛН', C: 'ЦН', RW: 'ПН', LD: 'ЛЗ', RD: 'ПЗ', G1: 'ВРТ', G2: 'ВРТ 2' };
export const LINE_COLORS = ['#2b88cf', '#1f9d6b', '#c98612', '#8a4fd8'];

/** Две команды: раскидываем по очереди внутри каждой позиции, чтобы составы были ровными. */
export function autoFillSplit(players: PublicUser[], lines: number): LineupItem[] {
  const dark: PublicUser[] = [];
  const light: PublicUser[] = [];
  for (const pos of ['G', 'D', 'F']) {
    for (const p of players.filter((x) => (x.position ?? 'F') === pos)) (dark.length <= light.length ? dark : light).push(p);
  }
  return [...autoFill(dark, lines, 'dark'), ...autoFill(light, lines, 'light')];
}

/** Раскидать по позициям: вратари → защитники → нападающие, остаток — в свободные места. */
export function autoFill(players: PublicUser[], lines: number, team: Team = ''): LineupItem[] {
  const out: LineupItem[] = [];
  const free = (line: number, slot: string) => !out.some((i) => i.line === line && i.slot === slot);
  const place = (p: PublicUser, slots: [number, string][]) => {
    const s = slots.find(([l, sl]) => free(l, sl));
    if (s) out.push({ user_id: p.id, team, line: s[0], slot: s[1] });
    return !!s;
  };
  const goalieSlots: [number, string][] = GOALIES.map((g) => [0, g]);
  const defSlots: [number, string][] = [];
  const fwdSlots: [number, string][] = [];
  for (let l = 1; l <= lines; l++) {
    DEF.forEach((s) => defSlots.push([l, s]));
    (['C', 'LW', 'RW'] as const).forEach((s) => fwdSlots.push([l, s]));
  }
  const left: PublicUser[] = [];
  for (const p of players.filter((p) => p.position === 'G')) if (!place(p, goalieSlots)) left.push(p);
  for (const p of players.filter((p) => p.position === 'D')) if (!place(p, defSlots)) left.push(p);
  for (const p of players.filter((p) => p.position !== 'G' && p.position !== 'D')) if (!place(p, fwdSlots)) left.push(p);
  // кто не влез по позиции — в любые свободные полевые места
  for (const p of left) place(p, [...fwdSlots, ...defSlots]);
  return out;
}

