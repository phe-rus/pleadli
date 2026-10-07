import * as m from '@/paraglide/messages'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/orchestra/$orgId/backups')({
  component: RouteComponent,
})

const institutionRoute = getRouteApi('/_protected/orchestra/$orgId')

function size(bytes: number | null) {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

/** Facts about backups, never the backups: they go from each computer to the
 * institution's own storage, and only "when, how big, did it work" comes here. */
function RouteComponent() {
  const { backups, storage, computers } = institutionRoute.useLoaderData()
  return (
    <article className="container flex flex-col gap-6 py-10 md:max-w-4xl">
      <header>
        <h1>{m["orch.nav.backups"]()}</h1>
        <p className="text-muted-foreground">{m["orch.bk.lead"]()}</p>
      </header>
      <Group title={m["orch.bk.storage"]()}>
        {storage.length === 0 ? <GroupRow label={m["orch.bk.storage_none"]()} /> : storage.map((s) => <GroupRow key={s.id} label={s.label} detail={s.kind} />)}
      </Group>
      <Group title={m["orch.bk.history"]()}>
        {backups.length === 0 && <GroupRow label={m["orch.bk.empty"]()} />}
        {backups.map((b) => {
          const machine = computers.find((c) => c.id === b.computerId)
          return (
            <GroupRow
              key={b.id}
              label={new Date(b.at).toLocaleString()}
              detail={[machine && `Pleadli ${machine.application}`, size(b.sizeBytes), b.message].filter(Boolean).join(' · ')}
              value={<span className={b.ok ? '' : 'text-destructive'}>{b.ok ? m["orch.bk.ok"]() : m["orch.bk.failed"]()}</span>}
            />
          )
        })}
      </Group>
    </article>
  )
}
