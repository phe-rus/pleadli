import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@pleadli/ui/button"
import { Checkbox } from "@pleadli/ui/checkbox"
import { Input } from "@pleadli/ui/input"
import type { Column, RowData } from "@tanstack/react-table"
import { useMemo } from "react"
import type { DataTableFeatures } from "./data-table"
import { getColumnLabel } from "./utils"

/**
 * The quick-filter checkbox list's own candidate values. For a plain scalar
 * column, one value per distinct cell. For an array-valued column, the
 * individual items across every row's array are what should show up as
 * checkboxes.
 */
function useQuickFilterValues<TData>(
    data: TData[],
    colId: string,
    exclude: string[],
    isArrayColumn: boolean
) {
    return useMemo(() => {
        if (exclude.includes(colId)) return []
        if (isArrayColumn) {
            const flattened = data.flatMap((row) => {
                const value = (row as Record<string, unknown>)[colId]
                return Array.isArray(value) ? value : []
            })
            const unique = [
                ...new Set(flattened.filter((v) => v !== null && v !== undefined && v !== "")),
            ]
            if (unique.length < 2 || unique.length > 20) return []
            return unique.map((v) => String(v))
        }
        const raw = data.map((row) => (row as Record<string, unknown>)[colId])
        const unique = [
            ...new Set(
                raw.filter(
                    (v) => v !== null && v !== undefined && v !== "" && typeof v !== "object"
                )
            ),
        ]
        if (unique.length < 2 || unique.length > 12) return []
        return unique.map((v) => String(v))
    }, [data, colId, exclude, isArrayColumn])
}

export function FilterRow<TData extends RowData>({
    column,
    data,
    skip,
    isArrayColumn,
    isDateColumn,
}: {
    column: Column<DataTableFeatures, TData, unknown>
    data: TData[]
    skip: string[]
    isArrayColumn: boolean
    isDateColumn: boolean
}) {
    const uniqueValues = useQuickFilterValues(data, column.id, skip, isArrayColumn)
    const label = getColumnLabel(column)

    // A date column never gets the enumerated-values treatment below —
    // every row realistically has its own distinct timestamp — a from/to
    // range is what's actually useful.
    if (isDateColumn) {
        const [from, to] = (column.getFilterValue() as [string?, string?] | undefined) ?? []
        return (
            <div className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-[11px] font-medium text-muted-foreground">
                    {label}
                </span>
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={from ?? ""}
                        onChange={(e) => column.setFilterValue([e.target.value || undefined, to])}
                        className="h-7 rounded-none border border-dashed border-input/40 bg-background px-2 text-xs outline-none"
                    />
                    <span className="text-[11px] text-muted-foreground">to</span>
                    <input
                        type="date"
                        value={to ?? ""}
                        onChange={(e) => column.setFilterValue([from, e.target.value || undefined])}
                        className="h-7 rounded-none border border-dashed border-input/40 bg-background px-2 text-xs outline-none"
                    />
                    {(from || to) && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => column.setFilterValue(undefined)}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                        </Button>
                    )}
                </div>
            </div>
        )
    }

    // `activeFilter` is a bare value for a plain scalar column, or a
    // one-element array for an array-valued column (array-contains matching
    // needs an array of values to check for overlap, even when only one is
    // ever picked here).
    const activeFilter = column.getFilterValue() as string | string[] | undefined
    const activeValue = isArrayColumn
        ? Array.isArray(activeFilter)
            ? activeFilter[0]
            : undefined
        : (activeFilter as string | undefined)

    if (uniqueValues.length > 0) {
        return (
            <div className="flex flex-col gap-1">
                <span className="text-xs">{label}</span>
                <div className="flex flex-wrap items-center gap-3">
                    {uniqueValues.map((value) => {
                        const active = activeValue === value
                        const setActive = () =>
                            column.setFilterValue(
                                active ? undefined : isArrayColumn ? [value] : value
                            )
                        return (
                            <div
                                key={value}
                                className="flex cursor-pointer items-center gap-2"
                                onClick={setActive}
                            >
                                <Checkbox
                                    aria-label={value}
                                    checked={active}
                                    onCheckedChange={setActive}
                                />
                                <span className="text-xs">{value}</span>
                            </div>
                        )
                    })}
                    {activeValue && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => column.setFilterValue(undefined)}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                            Clear
                        </Button>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-3">
            <span className="w-fit text-xs shrink-0">
                {label}
            </span>
            <div className="relative max-w-xs flex-1">
                <Input
                    type="text"
                    placeholder={`Filter ${label.toLowerCase()}…`}
                    value={activeValue ?? ""}
                    onChange={(e) =>
                        column.setFilterValue(
                            e.target.value
                                ? isArrayColumn
                                    ? [e.target.value]
                                    : e.target.value
                                : undefined
                        )
                    }
                />
                {activeValue && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => column.setFilterValue(undefined)}
                        className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                    </Button>
                )}
            </div>
        </div>
    )
}
