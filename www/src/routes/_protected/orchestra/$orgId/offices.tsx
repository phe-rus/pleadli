import { NativeSelect } from '@/components/native-select'
import { officeKindFor, officeKindLabel, officeKinds } from '@/data/orchestra'
import { addOffice } from '@/functions/orchestra.func'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Input } from '@pleadli/ui/input'
import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_protected/orchestra/$orgId/offices')({
  component: RouteComponent,
})

const institutionRoute = getRouteApi('/_protected/orchestra/$orgId')

function RouteComponent() {
  const { institution, offices } = institutionRoute.useLoaderData()
  const router = useRouter()
  const [name, setName] = useState('')
  const [kind, setKind] = useState(officeKindFor[institution.institutionType] ?? 'office')
  const [district, setDistrict] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await addOffice({ data: { organizationId: institution.id, name, kind, district: district || undefined } })
      t.success(m["orch.offices.added"]())
      setName('')
      setDistrict('')
      void router.invalidate()
    } catch (e) {
      t.error(m["orch.failed"](), { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="container flex flex-col gap-6 py-10 md:max-w-4xl">
      <header>
        <h1>{m["orch.nav.offices"]()}</h1>
        <p className="text-muted-foreground">{m["orch.offices.lead"]()}</p>
      </header>
      <Group>
        {offices.length === 0 && <GroupRow label={m["orch.offices.empty"]()} />}
        {offices.map((o) => (
          <GroupRow key={o.id} label={o.name} detail={[officeKindLabel(o.kind), o.district].filter(Boolean).join(' · ')} value={o.address ? <span className="font-mono text-xs">{o.address}</span> : undefined} />
        ))}
      </Group>
      {institution.kind === 'institution' && (
        <form onSubmit={add} className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-border/70">
          <h2 className="text-base! font-semibold">{m["orch.reg.add_office"]()}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <Input required minLength={2} placeholder={m["orch.reg.office_name"]()} value={name} onChange={(e) => setName(e.target.value)} />
            <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)} aria-label={m["orch.offices.kind"]()}>
              {officeKinds.map((k) => (
                <option key={k} value={k}>
                  {officeKindLabel(k)}
                </option>
              ))}
            </NativeSelect>
            <Input placeholder={m["orch.reg.district"]()} value={district} onChange={(e) => setDistrict(e.target.value)} />
          </div>
          <Button type="submit" className="w-fit" disabled={busy}>
            {m["orch.offices.add"]()}
          </Button>
        </form>
      )}
    </article>
  )
}
