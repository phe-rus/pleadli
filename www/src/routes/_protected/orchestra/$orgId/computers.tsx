import { appLabel } from '@/data/orchestra'
import { DAY, TRIAL_DAYS } from '@/lib/orchestra'
import * as m from '@/paraglide/messages'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/orchestra/$orgId/computers')({
  component: RouteComponent,
})

const institutionRoute = getRouteApi('/_protected/orchestra/$orgId')

function RouteComponent() {
  const { computers, offices } = institutionRoute.useLoaderData()
  const now = Date.now()
  return (
    <article className="container flex flex-col gap-6 py-10 md:max-w-4xl">
      <header>
        <h1>{m["orch.nav.computers"]()}</h1>
        <p className="text-muted-foreground">{m["orch.comp.lead"]()}</p>
      </header>
      {computers.length === 0 ? (
        <p className="rounded-xl bg-muted/40 p-6 text-center text-muted-foreground">{m["orch.comp.empty"]()}</p>
      ) : (
        <Group>
          {computers.map((c) => {
            const left = Math.ceil((new Date(c.trialStartedAt).getTime() + TRIAL_DAYS * DAY - now) / DAY)
            const state = c.licenceId ? m["orch.comp.licensed"]() : left > 0 ? m["orch.comp.trial"]({ days: String(left) }) : m["orch.comp.trial_ended"]()
            return (
              <GroupRow
                key={c.id}
                label={`${appLabel(c.application)}${c.unitId ? ` · ${offices.find((o) => o.id === c.unitId)?.name ?? ''}` : ''}`}
                detail={[c.version && `v${c.version}`, c.os, state].filter(Boolean).join(' · ')}
                value={m["orch.comp.seen"]({ date: new Date(c.lastSeenAt).toLocaleDateString() })}
              />
            )
          })}
        </Group>
      )}
    </article>
  )
}
