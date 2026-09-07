import { MoreVerticalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@pleadli/ui/button"
import { Checkbox } from "@pleadli/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@pleadli/ui/dropdown-menu"
import type { RowData } from "@tanstack/react-table"
import type { PropsWithChildren } from "react"
import type { DataTableColumnDef } from "./data-table"

type RowActionsMenuProps = PropsWithChildren

export function selectColumn<TData extends RowData>(): DataTableColumnDef<TData> {
    return {
        id: "select",
        enableColumnFilter: false,
        enableGlobalFilter: false,
        header: ({ table }) => (
            <Checkbox
                checked={table.getIsAllPageRowsSelected()}
                indeterminate={
                    table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
                }
                onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
                aria-label="Select all"
            />
        ),
        cell: ({ row }) => (
            <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(checked) => row.toggleSelected(checked)}
                aria-label="Select row"
            />
        ),
    }
}

export function RowActionsMenu({ children }: RowActionsMenuProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="Row actions">
                        <HugeiconsIcon icon={MoreVerticalIcon} className="size-4" />
                    </Button>
                }
            />
            <DropdownMenuContent aria-label="Row actions">{children}</DropdownMenuContent>
        </DropdownMenu>
    )
}
