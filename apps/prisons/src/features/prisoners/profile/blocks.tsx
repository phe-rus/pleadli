import { Createpanel } from '@/components/create-panel'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useState, type ReactNode } from 'react'

export function ProfileSection({
  title,
  count,
  description,
  action,
  children,
  className,
}: {
  title: string
  count?: number
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-base font-medium">
            {title}
            {count != null && count > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{count}</span>}
          </h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  )
}

export type ProfileColumn<T> = {
  header: string
  cell: (row: T) => ReactNode
  className?: string
}

export function ProfileTable<T>({
  rows,
  columns,
  getKey,
  empty,
}: {
  rows: readonly T[]
  columns: readonly ProfileColumn<T>[]
  getKey: (row: T) => string
  empty: string
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header} className={cn('text-left whitespace-nowrap', column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getKey(row)}>
              {columns.map((column) => (
                <td key={column.header} className={cn('align-top', column.className)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Dash() {
  return <span className="text-muted-foreground">·</span>
}

export function Facts({ items, className }: { items: readonly { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn('flex flex-col gap-2.5 text-sm', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5">
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{item.label}</dt>
          <dd className="font-medium break-words">{item.value ?? <Dash />}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A button that opens a drawer holding a form; owns the open and dirty state. */
export function FormDrawer({
  label,
  title,
  description,
  variant = 'secondary',
  add = true,
  children,
}: {
  label: string
  title: string
  description: string
  variant?: 'secondary' | 'default' | 'ghost'
  add?: boolean
  children: (close: () => void, setDirty: (dirty: boolean) => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  return (
    <Createpanel
      open={open}
      onOpenChange={setOpen}
      isDirty={dirty}
      trigger={
        <Button size="sm" variant={variant}>
          {add && <HugeiconsIcon icon={AddCircleIcon} />}
          {label}
        </Button>
      }
      headings={{ title, description }}
    >
      {children(() => setOpen(false), setDirty)}
    </Createpanel>
  )
}

/** A drawer opened by picking a row: shown while `item` is set. */
export function ItemDrawer<T>({
  item,
  onClose,
  title,
  description,
  children,
}: {
  item: T | null
  onClose: () => void
  title: string
  description: string
  children: (item: T, close: () => void, setDirty: (dirty: boolean) => void) => ReactNode
}) {
  const [dirty, setDirty] = useState(false)
  return (
    <Createpanel
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      isDirty={dirty}
      headings={{ title, description }}
    >
      {item !== null && children(item, onClose, setDirty)}
    </Createpanel>
  )
}
