import type { RowData } from "@tanstack/react-table"
import type { DataTableColumnDef } from "./data-table"

/** Whether any row actually holds an array for this column, checked against real data rather than requiring a caller to declare it. */
export function isArrayValuedColumn<TData>(data: TData[], colId: string): boolean {
    return data.some((row) => Array.isArray((row as Record<string, unknown>)[colId]))
}

export function columnIdOf<TData extends RowData>(
    col: DataTableColumnDef<TData>
): string | undefined {
    if ("id" in col && col.id) return col.id
    if ("accessorKey" in col && typeof col.accessorKey === "string") return col.accessorKey
    return undefined
}

export function getColumnLabel(column: { columnDef: { header?: unknown }; id: string }) {
    const header = column.columnDef.header
    if (typeof header === "string") return header
    return column.id.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())
}
