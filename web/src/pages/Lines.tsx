import type { LineupItem, PublicUser, Team } from '@shared/api';

export const FWD = ['LW', 'C', 'RW'] as const;
export const DEF = ['LD', 'RD'] as const;
export const GOALIES = ['G1', 'G2'] as const;
export const LINE_COLORS = ['#2b88cf', '#1f9d6b', '#c98612', '#a3bccc'];
const SLOT_LABEL: Record<string, string> = { LW: 'ЛН', C: 'ЦН', RW: 'ПН', LD: 'ЛЗ', RD: 'ПЗ', G1: 'ВРТ', G2: 'ВРТ 2' };

export const TEAM_LABEL: Record<string, string> = { dark: 'Тёмные', light: 'Светлые', '': '' };
export const TEAM_GEN: Record<string, string> = { dark: 'тёмных', light: 'светлых', '': '' };
export const ORD = ['', 'первой', 'второй', 'третьей', 'четвёртой'];

type Props = {
  team?: Team;
  lines: number;
  lineup: LineupItem[];
  players: Map<number, PublicUser>;
  myId?: number;
  selected?: { line: number; slot: string } | null;
  armed?: boolean; // выбран игрок из пула — подсвечиваем пустые слоты
  onSlot?: (line: number, slot: string) => void;
};

export default function Lines({ team = '', lines, lineup, players, myId, selected, armed, onSlot }: Props) {
  const at = (line: number, slot: string) => lineup.find((i) => i.team === team && i.line === line && i.slot === slot);
  const Slot = ({ line, slot }: { line: number; slot: string }) => {
    const item = at(line, slot);
    const p = item ? players.get(item.user_id) : undefined;
    const isSel = selected?.line === line && selected.slot === slot;
    return (
      <button
        type="button"
        className={`slot ${p ? 'filled' : ''} ${p && p.id === myId ? 'me' : ''} ${!p && armed ? 'target' : ''} ${isSel ? 'selected' : ''}`}
        onClick={onSlot ? () => onSlot(line, slot) : undefined}
        style={{ cursor: onSlot ? 'pointer' : 'default' }}
      >
        <span className="pos">{SLOT_LABEL[slot]}</span>
        {p ? (
          <>
            <span className="nm">{p.first_name}</span>
            <span className="no">
              #{p.number ?? '–'} {p.last_name?.[0] ? `${p.last_name[0]}.` : ''}
            </span>
          </>
        ) : (
          <span className="no">—</span>
        )}
      </button>
    );
  };

  return (
    <>
      {Array.from({ length: lines }, (_, i) => i + 1).map((line) => (
        <div key={line} className="rink-line">
          <h3>
            <span className="bar" style={{ background: LINE_COLORS[line - 1] }} />
            {line}-я пятёрка{team ? ` · ${TEAM_GEN[team]}` : ''}
          </h3>
          <div className="slots fwd">
            {FWD.map((s) => (
              <Slot key={s} line={line} slot={s} />
            ))}
          </div>
          <div className="slots def">
            {DEF.map((s) => (
              <Slot key={s} line={line} slot={s} />
            ))}
          </div>
        </div>
      ))}
      <div className="rink-line">
        <h3>
          <span className="bar" style={{ background: '#0d1f2d' }} />
          Вратари{team ? ` · ${TEAM_GEN[team]}` : ''}
        </h3>
        <div className="slots def" style={{ marginTop: 0 }}>
          {GOALIES.map((s) => (
            <Slot key={s} line={0} slot={s} />
          ))}
        </div>
      </div>
    </>
  );
}
