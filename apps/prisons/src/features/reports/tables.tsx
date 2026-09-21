import { Checkbox } from '@pleadli/ui/checkbox'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@pleadli/ui/popover'
import { cn } from '@pleadli/ui/lib/utils'
import { useState } from 'react'
import { format } from 'date-fns/format'
import { m } from '@/paraglide/messages'
import { changedCells, isEdited, tableFromRegister } from './blocks'
import { previewReport } from './data'
import { periodPresets, periodRange, periodText, type PeriodPreset } from './period'
import { isRegisterKind, type RegisterKind } from './registers'
import type { TableBlock } from './schema'

const PAGE = 25

/** The registers a table can be filled from. A Head Office has one, a facility
 * has five. */
const sourcesFor = (headOffice: boolean): RegisterKind[] =>
  headOffice ? ['network_register'] : ['admission_register', 'discharge_register', 'transfer_register', 'visitors_register', 'remand_list']

const sourceTitle: Record<RegisterKind, () => string> = {
  admission_register: () => m.reports_admission_register(),
  discharge_register: () => m.reports_discharge_register(),
  transfer_register: () => m.reports_transfer_register(),
  visitors_register: () => m.reports_visitors_register(),
  remand_list: () => m.reports_remand_list(),
  network_register: () => m.reports_network_register(),
}

const fieldClass = 'h-7 rounded-sm border border-input bg-input/20 px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30'

/**
 * A table in a composed report, and the place the officer decides what goes
 * in it. Load it from a register for a period, then choose which columns
 * show, which rows are in (by ticking them, or by taking the first so many),
 * and correct any cell. The register's own value is kept beside a corrected
 * cell, so the issued report can say how much of it was changed by hand.
 */
export function TableBlockEditor({ block, headOffice, onChange }: { block: TableBlock; headOffice: boolean; onChange: (block: TableBlock) => void }) {
  const kinds = sourcesFor(headOffice)
  const [kind, setKind] = useState<RegisterKind>(block.source && isRegisterKind(block.source.kind) ? block.source.kind : kinds[0])
  const [preset, setPreset] = useState<PeriodPreset>('last_month')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmReload, setConfirmReload] = useState(false)
  const [first, setFirst] = useState('')
  const [page, setPage] = useState(0)

  const takesPeriod = kind !== 'remand_list' && kind !== 'network_register'
  const range = periodRange(preset, '', '')
  const edited = changedCells(block)
  const visible = block.columns.filter((column) => column.visible)
  const included = block.rows.filter((row) => row.included).length
  const pages = Math.max(1, Math.ceil(block.rows.length / PAGE))
  const shown = block.rows.slice(page * PAGE, page * PAGE + PAGE)

  const load = async () => {
    if (edited > 0 && !confirmReload) {
      setConfirmReload(true)
      return
    }
    setConfirmReload(false)
    setLoading(true)
    setError(null)
    try {
      const document = await previewReport(kind, takesPeriod ? (range?.from ?? null) : null, takesPeriod ? (range?.to ?? null) : null)
      const next = tableFromRegister(kind, document, block)
      if (!next) setError(m.reports_this_report_could_not_be_read())
      else {
        setPage(0)
        onChange(next)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : m.facilities_please_try_again())
    } finally {
      setLoading(false)
    }
  }

  const setRows = (map: (row: TableBlock['rows'][number], index: number) => TableBlock['rows'][number]) => onChange({ ...block, rows: block.rows.map(map) })
  const editCell = (rowId: string, key: string, value: string) =>
    setRows((row) => (row.id === rowId ? { ...row, cells: { ...row.cells, [key]: value }, original: row.original ?? row.cells } : row))
  const addRow = () =>
    onChange({ ...block, rows: [...block.rows, { id: `m${block.rows.length}-${crypto.randomUUID().slice(0, 6)}`, included: true, cells: Object.fromEntries(block.columns.map((c) => [c.key, ''])), original: {} }] })
  const takeFirst = () => {
    const n = Number.parseInt(first, 10)
    if (Number.isFinite(n) && n >= 0) setRows((row, index) => ({ ...row, included: index < n }))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {m.reports_fill_from()}
          <select value={kind} onChange={(event) => setKind(event.target.value as RegisterKind)} className={fieldClass}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {sourceTitle[k]()}
              </option>
            ))}
          </select>
        </label>
        {takesPeriod && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {m.reports_period()}
            <select value={preset} onChange={(event) => setPreset(event.target.value as PeriodPreset)} className={fieldClass}>
              {periodPresets
                .filter((option) => option.id !== 'custom')
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label()}
                  </option>
                ))}
            </select>
          </label>
        )}
        <Button size="sm" variant="secondary" disabled={loading || (takesPeriod && !range)} onClick={() => void load()}>
          {loading ? m.reports_loading() : confirmReload ? m.reports_replace_edited_rows() : block.rows.length > 0 ? m.reports_reload_from_records() : m.reports_load_from_records()}
        </Button>
        {block.source && (
          <p className="pb-1">
            {[sourceTitle[kind](), block.source.from != null ? periodText(block.source.from, block.source.to) : null, m.reports_loaded_on({ date: format(block.source.loadedAt, 'd MMM yyyy, HH:mm') })].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      {error && <p className="text-destructive">{error}</p>}

      {block.rows.length > 0 || block.columns.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger render={<Button size="sm" variant="secondary" />}>{m.reports_columns_shown({ shown: visible.length, total: block.columns.length })}</PopoverTrigger>
              <PopoverContent align="start" className="w-64 gap-2">
                {block.columns.map((column) => (
                  <label key={column.key} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={column.visible}
                      onCheckedChange={(checked) => onChange({ ...block, columns: block.columns.map((c) => (c.key === column.key ? { ...c, visible: checked === true } : c)) })}
                    />
                    {column.label}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
            <Button size="sm" variant="secondary" onClick={() => setRows((row) => ({ ...row, included: true }))}>
              {m.reports_select_all()}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRows((row) => ({ ...row, included: false }))}>
              {m.reports_select_none()}
            </Button>
            <form
              className="flex items-center gap-1"
              onSubmit={(event) => {
                event.preventDefault()
                takeFirst()
              }}
            >
              <Input value={first} onChange={(event) => setFirst(event.target.value)} inputMode="numeric" placeholder={m.reports_first_n_placeholder()} aria-label={m.reports_take_first()} className="h-7 w-16 text-xs" />
              <Button size="sm" variant="secondary" type="submit" disabled={first.trim() === ''}>
                {m.reports_take_first()}
              </Button>
            </form>
            <p className="ml-auto">{m.reports_rows_in({ included, total: block.rows.length })}</p>
          </div>

          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left">
                  <th className="w-8 px-2 py-1.5" />
                  <th className="w-8 px-2 py-1.5">{m.reports_column_no()}</th>
                  {visible.map((column) => (
                    <th key={column.key} className={cn('px-2 py-1.5', column.align === 'right' && 'text-right')}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row, offset) => (
                  <tr key={row.id} className={cn('border-b border-border/40 align-top', !row.included && 'text-muted-foreground opacity-60')}>
                    <td className="px-2 py-1">
                      <Checkbox
                        checked={row.included}
                        aria-label={m.reports_include_row({ n: page * PAGE + offset + 1 })}
                        onCheckedChange={(checked) => setRows((r) => (r.id === row.id ? { ...r, included: checked === true } : r))}
                      />
                    </td>
                    <td className="px-2 py-1 tabular-nums">{page * PAGE + offset + 1}</td>
                    {visible.map((column) => (
                      <td key={column.key} className="p-0.5">
                        <input
                          value={row.cells[column.key] ?? ''}
                          onChange={(event) => editCell(row.id, column.key, event.target.value)}
                          aria-label={column.label}
                          className={cn(
                            'w-full min-w-24 rounded-sm border border-transparent bg-transparent px-1.5 py-1 outline-none hover:border-input focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
                            column.align === 'right' && 'text-right tabular-nums',
                            isEdited(row, column.key) && 'bg-primary/10',
                          )}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={addRow}>
                {m.reports_add_row()}
              </Button>
              {edited > 0 && <p>{m.reports_cells_changed({ count: edited })}</p>}
            </div>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  {m.reports_previous()}
                </Button>
                <p>{m.reports_page_of({ page: page + 1, pages })}</p>
                <Button size="sm" variant="secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                  {m.reports_next()}
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <p>{m.reports_table_empty()}</p>
      )}

      <Input value={block.caption} onChange={(event) => onChange({ ...block, caption: event.target.value })} placeholder={m.reports_table_caption()} aria-label={m.reports_table_caption()} />
    </div>
  )
}

/** A table as it reads in the finished report: the columns and rows that were
 * chosen, with a mark on a cell that was changed by hand and a line at the foot
 * saying how many were. On paper the heading row repeats on every page. */
export function ComposedTable({ block }: { block: TableBlock }) {
  const visible = block.columns.filter((column) => column.visible)
  const rows = block.rows.filter((row) => row.included)
  const changed = changedCells(block)
  if (visible.length === 0) return null
  return (
    <figure className="flex flex-col gap-1">
      {block.caption && <figcaption>{block.caption}</figcaption>}
      <table className="w-full text-xs">
        <thead className="print:table-header-group">
          <tr>
            <th className="w-8 text-left">{m.reports_column_no()}</th>
            {visible.map((column) => (
              <th key={column.key} className={column.align === 'right' ? 'text-right' : 'text-left'}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className="break-inside-avoid align-top">
              <td>{index + 1}</td>
              {visible.map((column) => (
                <td key={column.key} className={column.align === 'right' ? 'text-right tabular-nums' : undefined}>
                  {row.cells[column.key]}
                  {isEdited(row, column.key) && <sup>*</sup>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {m.reports_total_entries({ count: rows.length })}
        {changed > 0 && ` · * ${m.reports_cells_changed({ count: changed })}`}
      </p>
    </figure>
  )
}
