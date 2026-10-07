import { EmptyNote } from '@/components/planned'
import { tabIcon } from '@/features/workspace/tab-icon'
import { tabLabel } from '@/features/workspace/tab-identity'
import { useWorkspace } from '@/features/workspace/tabs-store'
import * as m from '@/paraglide/messages'
import { Clock01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/recent/')({
  component: RouteComponent,
})

/** The matters and documents opened lately on this computer, newest first: one
 * place for them, as Finder has Recents, rather than a list in the sidebar. */
function RouteComponent() {
  const { recents } = useWorkspace()
  const matters = recents.filter((r) => r.kind === 'matter')
  const documents = recents.filter((r) => r.kind === 'document')

  const group = (title: string, list: typeof recents) =>
    list.length > 0 && (
      <Group title={title}>
        {list.map((item) => (
          <GroupRow
            key={item.key}
            icon={<HugeiconsIcon icon={tabIcon(item)} className="text-muted-foreground" />}
            label={tabLabel(item)}
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
          <h1>{m["nav.recent"]()}</h1>
          <p>{m["recent.subtitle"]()}</p>
        </div>
      </header>
      {matters.length + documents.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={Clock01Icon} />}>{m["recent.empty"]()}</EmptyNote>
      ) : (
        <>
          {group(m["recent.matters"](), matters)}
          {group(m["nav.documents"](), documents)}
        </>
      )}
    </article>
  )
}
