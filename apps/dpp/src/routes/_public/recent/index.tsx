import { EmptyNote } from '@/components/planned'
import { tabIcon } from '@/features/workspace/tab-icon'
import { tabTitle } from '@/features/workspace/tab-identity'
import { useWorkspace } from '@/features/workspace/tabs-store'
import * as m from '@/paraglide/messages'
import { Clock01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/recent/')({
  component: RouteComponent,
})

/** The files and documents opened lately on this computer, newest first: one
 * place for them, as Finder has Recents, rather than a list in the sidebar. */
function RouteComponent() {
  const { recents } = useWorkspace()
  const items = recents.filter((r) => r.kind === 'file' || r.kind === 'document')
  const files = items.filter((r) => r.kind === 'file')
  const documents = items.filter((r) => r.kind === 'document')

  const group = (title: string, list: typeof items) =>
    list.length > 0 && (
      <Group title={title}>
        {list.map((item) => (
          <GroupRow
            key={item.key}
            icon={<HugeiconsIcon icon={tabIcon(item)} className="text-muted-foreground" />}
            label={tabTitle(item)}
            chevron
            render={({ className, children }) => (
              <Link to={item.to} className={className}>
                {children}
              </Link>
            )}
          />
        ))}
      </Group>
    )

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.recent"]()}</h1>
          <p>{m["recent.subtitle"]()}</p>
        </div>
      </header>
      {items.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={Clock01Icon} />}>{m["recent.empty"]()}</EmptyNote>
      ) : (
        <>
          {group(m["search.group.files"](), files)}
          {group(m["nav.item.documents"](), documents)}
        </>
      )}
    </article>
  )
}
