/**
 * Rich Messages (Bot API 10.1+): сообщения из блоков — заголовки, абзацы, таблицы, цитаты.
 * Строим блоки здесь; если Telegram не примет rich-сообщение, telegram.ts пошлёт
 * обычный HTML-текст, собранный из тех же блоков (toLegacyHtml).
 */

export interface Cell {
  text?: string;
  is_header?: boolean;
  align?: 'left' | 'center' | 'right';
  colspan?: number;
}

export type Block =
  | { type: 'heading'; text: string; size: number }
  | { type: 'paragraph'; text: string }
  | { type: 'expandable_blockquote'; text: string }
  | { type: 'table'; cells: Cell[][]; is_bordered?: boolean; is_striped?: boolean; is_compact?: boolean; caption?: string };

export const h = (text: string, size = 2): Block => ({ type: 'heading', text, size });
export const p = (text: string): Block => ({ type: 'paragraph', text });
export const quote = (text: string): Block => ({ type: 'expandable_blockquote', text });

/** Таблица: первая строка — заголовки. Пустые строки в ячейках заменяем на «—», чтобы клетка была видна. */
export function table(head: string[] | null, rows: (string | number | null | undefined)[][], opts: { caption?: string; align?: Cell['align'][] } = {}): Block {
  const cells: Cell[][] = [];
  if (head) cells.push(head.map((t, i) => ({ text: t, is_header: true, align: opts.align?.[i] ?? 'left' })));
  for (const r of rows) cells.push(r.map((v, i) => ({ text: v == null || v === '' ? '—' : String(v), align: opts.align?.[i] ?? 'left' })));
  return { type: 'table', cells, is_bordered: true, is_striped: true, is_compact: true, ...(opts.caption ? { caption: opts.caption } : {}) };
}

/** Ключ → значение (таблица без заголовка). */
export const kv = (rows: [string, string | number | null | undefined][]) => table(null, rows);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Запасной вариант для обычного sendMessage (parse_mode HTML). */
export function toLegacyHtml(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === 'heading') out.push(`<b>${esc(b.text)}</b>`);
    else if (b.type === 'paragraph') out.push(esc(b.text));
    else if (b.type === 'expandable_blockquote') out.push(`<blockquote expandable>${esc(b.text)}</blockquote>`);
    else if (b.type === 'table') {
      const [first, ...rest] = b.cells;
      const hasHead = first?.every((c) => c.is_header);
      const head = hasHead ? first.map((c) => c.text ?? '') : null;
      const rows = hasHead ? rest : b.cells;
      const lines = rows.map((r) =>
        head
          ? r.map((c, i) => (i === 0 ? `<b>${esc(c.text ?? '')}</b>` : `${head[i] ? `${esc(head[i])}: ` : ''}${esc(c.text ?? '')}`)).join(' · ')
          : r.map((c, i) => (i === 0 ? esc(c.text ?? '') : `<b>${esc(c.text ?? '')}</b>`)).join(': '),
      );
      if (b.caption) lines.unshift(`<i>${esc(b.caption)}</i>`);
      out.push(lines.join('\n'));
    }
  }
  return out.join('\n\n');
}

/** Простой текст — для ленты уведомлений в приложении. */
export function toPlain(blocks: Block[]): string {
  return toLegacyHtml(blocks)
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
