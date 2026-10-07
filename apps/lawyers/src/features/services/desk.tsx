import { Createpanel } from '@/components/create-panel'
import { createClient, listClients } from '@/features/clients/data'
import { createDocument } from '@/features/documents/data'
import { installationOptions, useActor } from '@/features/installation'
import { matterTypeLabel, useEnabledMatterTypes, useMatterTypes } from '@/features/matter-types'
import { setUsages } from '@/features/installation/data'
import { useUsagesEnabled } from '@/features/installation/queries'
import type { Usage } from '@/features/usages'
import { createMatter, setStage } from '@/features/matters/data'
import { createTask } from '@/features/tasks/data'
import { legalDate, templates, type TemplateContext } from '@/features/templates'
import { messageOf } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { services, type Service } from './catalogue'

/** Starting a service for a client: who they are, then everything at once. */
function StartService({ service, onDone }: { service: Service; onDone: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const actor = useActor()
  const { data: install } = useQuery(installationOptions())
  const [query, setQuery] = useState('')
  const [clientId, setClientId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const { data: found = [] } = useQuery({ queryKey: ['clients', 'search', query], queryFn: () => listClients(query), enabled: query.trim().length > 1 })
  const chosen = found.find((c) => c.id === clientId)

  const start = async () => {
    setBusy(true)
    try {
      const client = chosen ?? (await createClient({ name: name.trim(), kind: 'person', phone: phone.trim() || null, email: null, address: null, custody: null, custodyPlace: null, notes: null }))
      const matter = await createMatter({ clientId: client.id, title: `${service.label()}: ${client.name}`, ourRef: null, courtNumber: null, courtName: null, courtLevel: null, offence: null, engagement: 'private', appointedOn: null, notes: null, matterType: service.matterType })
      if (service.stage) await setStage(matter.id, service.stage)
      const ctx: TemplateContext = {
        court: '',
        courtNumber: '',
        client: client.name,
        otherSide: '',
        firm: install?.officeName ?? '',
        address: install?.address ?? '',
        advocate: actor?.name ?? '',
        today: legalDate(Date.now()),
        matterType: service.matterType,
        offence: '',
        ourRef: '',
        nextHearing: '',
        remandDays: null,
      }
      for (const id of service.papers) {
        const tpl = templates.find((x) => x.id === id)
        if (tpl) await createDocument({ matterId: matter.id, kind: tpl.kind, title: tpl.title(ctx), body: tpl.body(ctx) || undefined })
      }
      for (const step of service.steps) {
        await createTask({ matterId: matter.id, title: step.title(), detail: `${step.where()}${step.fee ? ` · ${m["svc.fee_guide"]({ fee: step.fee })}` : ''}`, dueOn: null })
      }
      await queryClient.invalidateQueries()
      t.success(m["svc.started"]({ service: service.label() }))
      onDone()
      void navigate({ to: '/matters/$matterId', params: { matterId: matter.id } })
    } catch (error) {
      t.error(m["svc.start_failed"](), { description: messageOf(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <div className="rounded-lg bg-secondary/50 p-3 text-sm">
        <p className="font-medium">{m["svc.leaves_with"]()}</p>
        <p className="text-muted-foreground">{service.leaves()}</p>
      </div>
      <Field>
        <FieldLabel>{m["svc.existing_client"]()}</FieldLabel>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={m["svc.search_client"]()} />
        {found.length > 0 && (
          <ul className="flex list-none flex-col gap-0.5 p-0">
            {found.slice(0, 6).map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setClientId(c.id === clientId ? null : c.id)} className={cn('w-full cursor-pointer rounded-md px-2 py-1 text-left text-sm', c.id === clientId ? 'bg-primary/10 text-foreground' : 'hover:bg-secondary')}>
                  {c.name}
                  {c.phone ? <span className="ms-2 text-xs text-muted-foreground">{c.phone}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Field>
      {!chosen && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>{m["svc.new_client_name"]()}</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{m["svc.phone"]()}</FieldLabel>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{m["svc.what_happens"]()}</p>
        <ol className="list-decimal ps-5 text-sm text-muted-foreground">
          {service.steps.map((step, i) => (
            <li key={i}>
              {step.title()} <span className="text-xs">({step.where()}{step.fee ? `, ${m["svc.fee_guide"]({ fee: step.fee })}` : ''})</span>
            </li>
          ))}
        </ol>
      </div>
      <Button disabled={busy || (!chosen && !name.trim())} onClick={() => void start()}>
        {busy ? m["svc.starting"]() : m["svc.start"]()}
      </Button>
    </div>
  )
}

/**
 * The walk-in desk: what a client comes in for, and what they leave with.
 * One choice opens the matter, drafts its papers and lists its steps.
 */
export function ServicesDesk() {
  const enabled = useEnabledMatterTypes()
  const { data: allTypes } = useMatterTypes()
  const { data: usagesOn } = useUsagesEnabled()
  const actor = useActor()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<Service | null>(null)
  // An administrator turns on the kind of work a service needs, right here.
  const turnOn = async (svc: Service) => {
    const usage = allTypes?.find((x) => x.id === svc.matterType)?.usage
    if (!usage) return
    try {
      await setUsages([...new Set([...(usagesOn ?? []), usage])] as Usage[])
      await queryClient.invalidateQueries()
      setOpen(svc)
    } catch (error) {
      t.error(m["svc.start_failed"](), { description: messageOf(error) })
    }
  }
  return (
    <>
      <header className="page-header">
        <div>
          <h1>{m["svc.title"]()}</h1>
          <p>{m["svc.lead"]()}</p>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {services.map((svc) => {
          const on = enabled.some((e) => e.id === svc.matterType)
          return (
            <div key={svc.id} className="flex flex-col gap-2">
            <button
              type="button"
              disabled={!on}
              onClick={() => setOpen(svc)}
              className="flex cursor-pointer flex-col items-start gap-2 rounded-xl border border-border/70 p-4 text-left transition-colors hover:border-primary/50 disabled:cursor-default disabled:opacity-60"
            >
              <span className="font-medium">{svc.label()}</span>
              <span className="text-sm text-muted-foreground">{svc.about()}</span>
              <span className="text-xs">
                <span className="font-medium">{m["svc.leaves_with"]()}</span> {svc.leaves()}
              </span>
              {!on && <span className="text-xs text-amber-700 dark:text-amber-300">{m["svc.turn_on"]({ kind: matterTypeLabel(svc.matterType) })}</span>}
            </button>
            {!on && actor?.isAdmin && (
              <Button size="sm" variant="outline" className="self-start" onClick={() => void turnOn(svc)}>
                {m["svc.turn_on_now"]()}
              </Button>
            )}
            </div>
          )
        })}
      </div>
      {open && (
        <Createpanel open onOpenChange={(o) => !o && setOpen(null)} headings={{ title: open.label(), description: open.about() }}>
          <StartService service={open} onDone={() => setOpen(null)} />
        </Createpanel>
      )}
    </>
  )
}
