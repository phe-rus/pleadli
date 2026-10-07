import { Tag } from '@/components/status-tag'
import type { ReactNode } from 'react'
import * as m from '@/paraglide/messages'

/** A capability the product will have and this build does not. It says so, and
 * says what it will cover, so a destination is never mistaken for a working one
 * and never filled with invented data. */
export function Planned({ title, children, covers }: { title: string; children?: ReactNode; covers?: readonly string[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3>{title}</h3>
        <Tag tone="planned">{m["common.planned"]()}</Tag>
      </div>
      {children && <p>{children}</p>}
      {covers && (
        <div role="list" className="flex flex-col gap-1">
          {covers.map((item) => (
            <p key={item} role="listitem" className="text-muted-foreground">
              {item}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}

/** Nothing here yet, said plainly. */
export function EmptyNote({ children, icon, action }: { children: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-foreground/[0.025] px-6 py-10 text-center">
      {icon && <span className="text-muted-foreground/60 [&_svg]:size-8">{icon}</span>}
      <p className="max-w-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  )
}
