import { isRegisterKind, registerDefs } from './registers'
import type { Block, GeneratedReport, TableBlock, TextBlock } from './schema'
import { periodText } from './period'
import { m } from '@/paraglide/messages'

export const newId = () => crypto.randomUUID()

/** Standing in a document as its own record: an empty paragraph. */
export const emptyDoc = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

export const newTextBlock = (doc = emptyDoc): TextBlock => ({ id: newId(), type: 'text', doc })

export const headingDoc = (text: string, note?: string) =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] }, ...(note ? [{ type: 'paragraph', content: [{ type: 'text', text: note }] }] : [])],
  })

export const newTableBlock = (): TableBlock => ({ id: newId(), type: 'table', caption: '', source: null, columns: [], rows: [] })

/** A table filled from what a register holds for a period: every column shown
 * and every row in, to be cut down by the officer. `null` if the kind is not a
 * register or its body could not be read. */
export function tableFromRegister(kind: string, document: Pick<GeneratedReport['document'], 'body' | 'asAt' | 'periodFrom' | 'periodTo'>, previous?: TableBlock): TableBlock | null {
  if (!isRegisterKind(kind)) return null
  const def = registerDefs[kind]
  const rows = def.rows(document.body, document.asAt)
  if (!rows) return null
  return {
    id: previous?.id ?? newId(),
    type: 'table',
    caption: previous?.caption ?? '',
    source: { kind, from: document.periodFrom, to: document.periodTo, loadedAt: document.asAt },
    columns: def.columns.map((column) => ({ key: column.key, label: column.header(), align: column.align ?? 'left', visible: true })),
    rows: rows.map((cells, index) => ({ id: `r${index}`, included: true, cells })),
  }
}

/** A starting document for a register: a heading saying what it is and the
 * period, then the table. */
export function registerDraft(kind: string, title: string, document: Parameters<typeof tableFromRegister>[1]): Block[] | null {
  const table = tableFromRegister(kind, document)
  if (!table) return null
  return [newTextBlock(headingDoc(title, document.periodFrom != null ? periodText(document.periodFrom, document.periodTo) : m.reports_as_at_generation())), table]
}

/** How many cells were typed over or added by hand, among the rows that are in. */
export function changedCells(block: TableBlock) {
  let count = 0
  for (const row of block.rows) {
    if (!row.included || !row.original) continue
    for (const column of block.columns) if (column.visible && (row.original[column.key] ?? '') !== (row.cells[column.key] ?? '')) count += 1
  }
  return count
}

export const isEdited = (row: TableBlock['rows'][number], key: string) => row.original !== undefined && (row.original[key] ?? '') !== (row.cells[key] ?? '')
