import {
    ChevronFirstIcon,
    ChevronLastIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactTable, RowData } from "@tanstack/react-table"
import { Button } from "@pleadli/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@pleadli/ui/select"
import type { DataTableFeatures } from "./data-table"

type DataTablePaginationProps<TData extends RowData> = {
    table: ReactTable<DataTableFeatures, TData>
    pageSizeOptions?: number[]
}

export function DataTablePagination<TData extends RowData>({
    table,
    pageSizeOptions = [10, 20, 30, 50],
}: DataTablePaginationProps<TData>) {
    const { pageIndex, pageSize } = table.state.pagination
    const pageCount = table.getPageCount()

    return (
        <div className="flex items-center gap-4">
            <p className="text-xs text-muted-foreground">
                Page {pageCount ? pageIndex + 1 : 0} of {pageCount}
            </p>

            <div className="flex items-center gap-1">
                <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.setPageIndex(0)}
                >
                    <HugeiconsIcon icon={ChevronFirstIcon} />
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.previousPage()}
                >
                    <HugeiconsIcon icon={ChevronLeftIcon} />
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.nextPage()}
                >
                    <HugeiconsIcon icon={ChevronRightIcon} />
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.setPageIndex(pageCount - 1)}
                >
                    <HugeiconsIcon icon={ChevronLastIcon} />
                </Button>
            </div>

            <Select
                aria-label="Rows per page"
                value={String(pageSize)}
                onValueChange={(key) => table.setPageSize(Number(key))}
            >
                <SelectTrigger size="sm" className="w-16">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {pageSizeOptions.map((size) => (
                        <SelectItem
                            key={size}
                            value={String(size)}
                        >
                            {size}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}
