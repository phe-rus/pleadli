import { Add01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'

export type QuickAddMenuItem = { id: string; label: string; icon: IconSvgElement }

/** The search field above the sidebar, as a button that opens the command menu. */
export function SearchButton({ label, hint, onOpen }: { label: string; hint: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-7.5 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg bg-foreground/[0.045] px-2.5 text-[0.8125rem] text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <HugeiconsIcon icon={Search01Icon} className="size-3.5 shrink-0" />
      <span className="flex-1 truncate text-left">{label}</span>
      <kbd className="font-sans text-[0.6875rem] text-muted-foreground/70">{hint}</kbd>
    </button>
  )
}

/** The "+" beside search: what a person most often needs to start. */
export function QuickAddMenu({
  items,
  labels,
  open,
  onOpenChange,
  searchEnabled,
  searchHint,
  onSearch,
  onPick,
}: {
  items: readonly QuickAddMenuItem[]
  labels: { quickAdd: string; find: string; start: string; search: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  searchEnabled: boolean
  searchHint: string
  onSearch: () => void
  onPick: (id: string) => void
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button size="icon-sm" variant="ghost" aria-label={labels.quickAdd} title={labels.quickAdd} className="size-7.5 shrink-0 cursor-pointer rounded-lg">
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent side="bottom" align="end" sideOffset={6} className="w-60">
        {searchEnabled && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{labels.find}</DropdownMenuLabel>
              <DropdownMenuItem onClick={onSearch}>
                <HugeiconsIcon icon={Search01Icon} />
                {labels.search}
                <DropdownMenuShortcut>{searchHint}</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{labels.start}</DropdownMenuLabel>
          {items.map((item) => (
            <DropdownMenuItem key={item.id} onClick={() => onPick(item.id)}>
              <HugeiconsIcon icon={item.icon} />
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
