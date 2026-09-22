import { Tag } from '@/components/status-tag'
import type { ReactNode } from 'react'

/** A capability the product will have and this build does not. It says so, and
 * says what it will cover, so a destination is never mistaken for a working one
 * and never filled with invented data. */
export function Planned({ title, children, covers }: { title: string; children?: ReactNode; covers?: readonly string[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3>{title}</h3>
        <Tag tone="planned">Planned</Tag>
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
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-4 text-muted-foreground">{children}</p>
}
