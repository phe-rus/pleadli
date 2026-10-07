import { NativeSelect } from '@/components/native-select'
import { appLabel } from '@/data/orchestra'
import { requestLicence } from '@/functions/orchestra.func'
import { APPLICATIONS } from '@/lib/orchestra'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Input } from '@pleadli/ui/input'
import { Textarea } from '@pleadli/ui/textarea'
import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_protected/orchestra/$orgId/licences')({
  component: RouteComponent,
})

const institutionRoute = getRouteApi('/_protected/orchestra/$orgId')

function RouteComponent() {
  const { institution, licences, computers, requests } = institutionRoute.useLoaderData()
  const router = useRouter()
  // The app this kind of institution uses: a police HQ asks for Pleadli Police.
  const usual = APPLICATIONS.find((a) => a === institution.institutionType) ?? 'police'
  const [application, setApplication] = useState<(typeof APPLICATIONS)[number]>(usual)
  const [seats, setSeats] = useState(1)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await requestLicence({ data: { organizationId: institution.id, application, seats, message: message || undefined } })
      t.success(m["orch.lic.sent"]())
      setMessage('')
      void router.invalidate()
    } catch (e) {
      t.error(m["orch.failed"](), { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  const reqStatus = (s: string) => (s === 'done' ? m["orch.lic.req_done"]() : s === 'declined' ? m["orch.lic.req_declined"]() : m["orch.lic.req_open"]())

  return (
    <article className="container flex flex-col gap-6 py-10 md:max-w-4xl">
      <header>
        <h1>{m["orch.nav.licences"]()}</h1>
        <p className="text-muted-foreground">{m["orch.lic.lead"]()}</p>
      </header>
      <Group>
        {licences.length === 0 && <GroupRow label={m["orch.lic.empty"]()} />}
        {licences.map((l) => {
          const ended = new Date(l.expiresAt).getTime() < Date.now()
          return (
            <GroupRow
              key={l.id}
              label={appLabel(l.application)}
              detail={m["orch.lic.row"]({ used: String(computers.filter((c) => c.licenceId === l.id).length), seats: String(l.seats), date: new Date(l.expiresAt).toLocaleDateString(), hint: l.keyHint })}
              value={l.status === 'revoked' ? m["orch.lic.revoked"]() : ended ? m["orch.lic.ended"]() : undefined}
            />
          )
        })}
      </Group>

      {institution.status === 'active' && (
        <form onSubmit={send} className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-border/70">
          <h2 className="text-base! font-semibold">{m["orch.lic.request_title"]()}</h2>
          <p className="text-sm text-muted-foreground">{m["orch.lic.request_lead"]()}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              {m["orch.lic.app"]()}
              <NativeSelect value={application} onChange={(e) => setApplication(e.target.value as (typeof APPLICATIONS)[number])}>
                {APPLICATIONS.map((a) => (
                  <option key={a} value={a}>
                    {appLabel(a)}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              {m["orch.lic.seats"]()}
              <Input type="number" min={1} value={seats} onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            {m["orch.lic.message"]()}
            <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          <Button type="submit" className="w-fit" disabled={busy}>
            {m["orch.lic.send"]()}
          </Button>
        </form>
      )}

      {requests.length > 0 && (
        <Group title={m["orch.lic.requests"]()}>
          {requests.map((r) => (
            <GroupRow key={r.id} label={`${appLabel(r.application)} · ${r.seats}`} detail={new Date(r.createdAt).toLocaleDateString()} value={reqStatus(r.status)} />
          ))}
        </Group>
      )}
    </article>
  )
}
