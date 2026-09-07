import {
  Cancel01Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Badge } from "@pleadli/ui/badge"
import { Button } from "@pleadli/ui/button"
import { Checkbox } from "@pleadli/ui/checkbox"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@pleadli/ui/input-group"
import { cn } from "@pleadli/ui/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@pleadli/ui/table"
import type {
  ColumnDef,
  ColumnFiltersState,
  ColumnVisibilityState,
  RowData,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table"
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrIncludes,
  filterFn_arrIncludesSome,
  filterFn_equals,
  filterFn_inDateRange,
  filterFn_inNumberRange,
  filterFn_includesString,
  flexRender,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { FilterRow } from "./filter-row"
import { DataTablePagination } from "./pagination"
import { columnIdOf, getColumnLabel, isArrayValuedColumn } from "./utils"

export const baseTableFeatures = tableFeatures({
  globalFilteringFeature,
  columnFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: {
    includesString: filterFn_includesString,
    inNumberRange: filterFn_inNumberRange,
    equals: filterFn_equals,
    arrIncludes: filterFn_arrIncludes,
    arrIncludesSome: filterFn_arrIncludesSome,
    inDateRange: filterFn_inDateRange,
  },
  sortFns: {
    text: sortFn_text,
    alphanumeric: sortFn_alphanumeric,
    datetime: sortFn_datetime,
  },
})

export type DataTableFeatures = typeof baseTableFeatures

/**
 * `filterVariant: 'date'` is the one thing a caller has to opt into
 * explicitly (`updatedAt`/`createdAt`, or a custom `type: 'date'` column):
 * unlike an array-valued column (detected automatically below, from the
 * actual data), a date is just a string or number at runtime, nothing to
 * sniff it from safely.
 */
export type DataTableColumnMeta = {
  filterVariant?: "date"
}

export type DataTableColumnDef<TData extends RowData, TValue = unknown> = ColumnDef<
  DataTableFeatures,
  TData,
  TValue
> & { meta?: DataTableColumnMeta }

type DataTableProps<TData extends RowData> = {
  data: TData[]
  // biome-ignore lint/suspicious/noExplicitAny: a column array mixes columns with different value types per accessor, same escape hatch tanstack-table's own ColumnDef[] typings use
  columns: DataTableColumnDef<TData, any>[]
  /**
   * A stable id per row, used as the React key and by react-table's row
   * model. Without this, react-table falls back to the row's array index,
   * so deleting a row shifts every id below it onto a different row's
   * data, reusing DOM nodes (and any open dropdown/overlay state) across
   * what are now different rows. Required, not defaulted, so this can't
   * silently regress.
   */
  getRowId: (row: TData) => string
  "aria-label": string
  emptyMessage?: ReactNode
  searchPlaceholder?: string
  bulkActions?: (selectedRows: TData[], clearSelection: () => void) => ReactNode
  /** Set false to render just the table. Default true. */
  pagination?: boolean
  pageSizeOptions?: number[]
  onSelectedRowsChange?: (rows: TData[]) => void
  /** A summary row rendered inside the table's own <tfoot>, below the data rows — e.g. a totals line. Gets the visible column count for its colSpan. */
  footer?: (columnCount: number) => ReactNode
}

/**
 * Self-contained table: pass `data` + `columns`, get sorting, pagination,
 * search, column visibility, per-column filters, and row selection for
 * free. There's no `useTable` state to wire up on the caller's side.
 */
export function DataTable<TData extends RowData>({
  data,
  columns,
  getRowId,
  emptyMessage = "No results.",
  searchPlaceholder = "Search…",
  bulkActions,
  pagination = true,
  pageSizeOptions,
  onSelectedRowsChange,
  footer,
  "aria-label": ariaLabel,
}: DataTableProps<TData>) {
  const [globalFilter, setGlobalFilter] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const augmentedColumns = useMemo(
    () =>
      columns.map((col) => {
        if (col.filterFn) return col
        const colId = columnIdOf(col)
        if (!colId) return col
        if (col.meta?.filterVariant === "date") {
          return { ...col, filterFn: filterFn_inDateRange }
        }
        if (isArrayValuedColumn(data, colId)) {
          return { ...col, filterFn: filterFn_arrIncludesSome }
        }
        return col
      }),
    [columns, data]
  )

  const table = useTable({
    features: baseTableFeatures,
    data,
    columns: augmentedColumns,
    getRowId,
    enableRowSelection: true,
    state: { globalFilter, sorting, columnFilters, columnVisibility, rowSelection },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    globalFilterFn: "auto",
  })

  const toggleableColumns = table.getAllColumns().filter((c) => c.getCanHide())
  const hiddenCount = toggleableColumns.filter((c) => !c.getIsVisible()).length

  const skip = ["select", "actions"]
  const filterableColumns = table
    .getAllColumns()
    .filter((c) => c.getCanFilter() && !skip.includes(c.id) && c.accessorFn !== undefined)

  const activeFilterCount = columnFilters.length
  const selectedCount = Object.values(rowSelection).filter(Boolean).length
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original)
  const clearSelection = () => setRowSelection({})

  const rows = table.getRowModel().rows
  const columnCount = table.getVisibleLeafColumns().length

  return (
    <div className="flex flex-col gap-3 [&_div]:no-scrollbar! [&_tr]:border-none!">
      <div className="relative flex items-center">
        <InputGroup className="max-w-full">
          <InputGroupInput
            placeholder={searchPlaceholder}
            autoComplete="off"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
          <InputGroupAddon align="inline-start">
            <HugeiconsIcon icon={Search01Icon} />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">
            <Button
              type="button"
              size="xs"
              variant={columnsOpen ? "default" : "secondary"}
              onClick={() => {
                setColumnsOpen((o) => !o)
                setFiltersOpen(false)
              }}
            >
              Columns
              {hiddenCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-0.5 size-4 p-0 text-[9px] tabular-nums"
                >
                  {hiddenCount}
                </Badge>
              )}
              <HugeiconsIcon
                icon={ChevronDownIcon}
                className={cn(
                  "transition-transform duration-150",
                  columnsOpen && "rotate-180"
                )}
              />
            </Button>
            <Button
              type="button"
              size="xs"
              variant={activeFilterCount > 0 || filtersOpen ? "default" : "secondary"}
              onClick={() => {
                setFiltersOpen((o) => !o)
                setColumnsOpen(false)
              }}
            >
              Filters
              {activeFilterCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-0.5 size-4 p-0 text-[9px] tabular-nums"
                >
                  {activeFilterCount}
                </Badge>
              )}
              <HugeiconsIcon
                icon={ChevronDownIcon}
                className={cn(
                  "transition-transform duration-150",
                  filtersOpen && "rotate-180"
                )}
              />
            </Button>
          </InputGroupAddon>
        </InputGroup>
      </div>

      {columnsOpen && (
        <div className="flex flex-col gap-2 border border-dashed border-input/30 bg-input/15 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs">Columns</h3>
            {hiddenCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => table.resetColumnVisibility()}
                className="text-muted-foreground hover:text-foreground"
              >
                Show all
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {toggleableColumns.map((column) => {
              const visible = column.getIsVisible()
              return (
                <div
                  key={column.id}
                  className="flex cursor-pointer items-center gap-2"
                  onClick={() => column.toggleVisibility()}
                >
                  <Checkbox
                    aria-label={getColumnLabel(column)}
                    checked={visible}
                    onCheckedChange={() => column.toggleVisibility()}
                  />
                  <span className="text-xs">{getColumnLabel(column)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {filtersOpen && (
        <div className="flex flex-col gap-2 border border-dashed border-input/30 bg-input/15 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs">Filters</h3>
            {activeFilterCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setColumnFilters([])}
                className="text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                Clear all
              </Button>
            )}
          </div>
          {filterableColumns.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">No filterable columns.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {filterableColumns.map((column) => (
                <FilterRow
                  key={column.id}
                  column={column}
                  data={data}
                  skip={skip}
                  isArrayColumn={isArrayValuedColumn(data, column.id)}
                  isDateColumn={
                    (column.columnDef as { meta?: DataTableColumnMeta }).meta
                      ?.filterVariant === "date"
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {bulkActions && selectedCount > 0 && (
        <div className="flex items-center gap-3 border border-dashed border-primary/30 bg-primary/5 px-4 py-2">
          <span className="text-xs font-medium">{selectedCount} selected</span>
          <div className="h-4 w-px bg-input/40" />
          {bulkActions(selectedRows, clearSelection)}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={clearSelection}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            Clear
          </Button>
        </div>
      )}

      <Table
        aria-label={ariaLabel}
        data-not-typeset={true}
        className="divide-none!"
      >
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <div
                      className={cn(
                        "flex w-fit cursor-pointer items-center gap-1"
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      <div className='flex items-center'>
                        <HugeiconsIcon
                          icon={ChevronUpIcon}
                          className={cn(
                            "size-3.5!", header.column.getIsSorted() === "asc" &&
                          "text-primary"
                          )}
                        />
                        <HugeiconsIcon
                          icon={ChevronDownIcon}
                          className={cn(
                            "size-3.5!", header.column.getIsSorted() === "desc" &&
                          "text-primary"
                          )}
                        />
                      </div>
                    </div>
                  ) : (
                    flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                onClick={() => {
                  if (!onSelectedRowsChange) return
                  row.toggleSelected()
                  onSelectedRowsChange(selectedRows)
                }}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-24 text-center">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {footer && <TableFooter>{footer(columnCount)}</TableFooter>}
      </Table>

      {pagination && <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />}
    </div>
  )
}
