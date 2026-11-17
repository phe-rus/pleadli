import { Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Group, GroupRow } from '@pleadli/ui/grouped'

export interface ListItem { title: string; detail: string; right?: string }

/** A register page made of the app's own list parts. Sample records only. */
export function ListPage({ eyebrow, title, action, groups }: { eyebrow?: string; title: string; action: string; groups: { title: string; items: ListItem[] }[] }) {
  return (
    <article className="page">
      <header className="page-header">
        <div>
          {eyebrow && <p className="text-[0.8125rem] font-medium text-muted-foreground">{eyebrow}</p>}
          <h1>{title}</h1>
        </div>
        <div className="page-actions">
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-[550] text-primary-foreground shadow-xs"><HugeiconsIcon icon={Add01Icon} className="size-4" /> {action}</span>
        </div>
      </header>
      {groups.map((g) => (
        <Group key={g.title} title={g.title}>
          {g.items.map((it) => <GroupRow key={it.title} label={it.title} detail={it.detail} value={it.right ? <span className="text-xs">{it.right}</span> : undefined} chevron={!it.right} />)}
        </Group>
      ))}
    </article>
  )
}
