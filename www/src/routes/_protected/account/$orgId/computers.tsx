import { appLabel } from '@/data/orchestra'
import { assignComputerOffice } from '@/functions/account.func'
import { DAY, TRIAL_DAYS } from '@/lib/orchestra'
import { useServerMutation } from '@/lib/use-server-mutation'
import * as m from '@/paraglide/messages'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/account/$orgId/computers')({
  component: RouteComponent,
})

const institutionRoute = getRouteApi('/_protected/account/$orgId')

/** Stands for "no office" in the picker: a computer with none receives mail at the institution's own address. */
const NONE = '__none__'

function RouteComponent() {
  const { computers, offices, institution } = institutionRoute.useLoaderData()
  const assign = useServerMutation(assignComputerOffice, { success: () => m["orch.comp.office_saved"]() })
  const now = Date.now()
  // Only an office with a Pleadli address can receive mail, so only those can be chosen.
  const choices = offices.filter((o) => o.address)
  const items = [{ value: NONE, label: m["orch.comp.office_none"]() }, ...choices.map((o) => ({ value: o.id, label: o.name }))]
  return (
    <article className="container flex flex-col gap-6 py-10 md:max-w-4xl">
      <header>
        <h1>{m["orch.nav.computers"]()}</h1>
        <p className="text-muted-foreground">{m["orch.comp.lead"]()}</p>
      </header>
      {computers.length > 0 && <p className="rounded-xl bg-foreground/[0.04] px-4 py-3 text-sm text-muted-foreground">{m["orch.comp.office_hint"]()}</p>}
      {computers.length === 0 ? (
        <p className="rounded-xl bg-muted/40 p-6 text-center text-muted-foreground">{m["orch.comp.empty"]()}</p>
      ) : (
        <Group>
          {computers.map((c) => {
            const left = Math.ceil((new Date(c.trialStartedAt).getTime() + TRIAL_DAYS * DAY - now) / DAY)
            const state = c.licenceId ? m["orch.comp.licensed"]() : left > 0 ? m["orch.comp.trial"]({ days: String(left) }) : m["orch.comp.trial_ended"]()
            const office = offices.find((o) => o.id === c.unitId)
            const address = office?.address ?? institution.address
            return (
              <GroupRow
                key={c.id}
                label={`${appLabel(c.application)}${office ? ` · ${office.name}` : ''}`}
                detail={[c.version && `v${c.version}`, c.os, state, address && m["orch.comp.receives_at"]({ address }), m["orch.comp.seen"]({ date: new Date(c.lastSeenAt).toLocaleDateString() })].filter(Boolean).join(' · ')}
                value={
                  <Select
                    items={items}
                    value={c.unitId ?? NONE}
                    disabled={assign.isPending}
                    onValueChange={(value) => {
                      const next = value && value !== NONE ? value : null
                      if (next !== (c.unitId ?? null)) assign.mutate({ organizationId: institution.id, computerId: c.id, unitId: next })
                    }}
                  >
                    <SelectTrigger className="w-56" aria-label={m["orch.comp.office"]()}>
                      <SelectValue placeholder={m["orch.comp.office"]()} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {items.map((i) => (
                          <SelectItem key={i.value} value={i.value}>
                            {i.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                }
              />
            )
          })}
        </Group>
      )}
    </article>
  )
}
