import { NativeSelect } from '@/components/native-select'
import { CONTACT } from '@/data/contact'
import { appLabel } from '@/data/orchestra'
import { writeToPleadli } from '@/functions/orchestra.func'
import { APPLICATIONS } from '@/lib/orchestra'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Input } from '@pleadli/ui/input'
import { Textarea } from '@pleadli/ui/textarea'
import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_protected/orchestra/$orgId/help')({
  component: RouteComponent,
})

const institutionRoute = getRouteApi('/_protected/orchestra/$orgId')

function RouteComponent() {
  const { institution, reports } = institutionRoute.useLoaderData()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [application, setApplication] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await writeToPleadli({ data: { organizationId: institution.id, title, body, application: (application || undefined) as (typeof APPLICATIONS)[number] | undefined } })
      t.success(m["orch.help.sent"]())
      setTitle('')
      setBody('')
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
        <h1>{m["orch.nav.help"]()}</h1>
        <p className="text-muted-foreground">{m["orch.help.lead"]()}</p>
      </header>
      <form onSubmit={send} className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-border/70">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            {m["orch.help.title_field"]()}
            <Input required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            {m["orch.help.app"]()}
            <NativeSelect value={application} onChange={(e) => setApplication(e.target.value)}>
              <option value="">{m["orch.help.any"]()}</option>
              {APPLICATIONS.map((a) => (
                <option key={a} value={a}>
                  {appLabel(a)}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          {m["orch.help.body"]()}
          <Textarea required minLength={3} rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <Button type="submit" className="w-fit" disabled={busy}>
          {m["orch.help.send"]()}
        </Button>
        <p className="text-sm text-muted-foreground">{m["orch.help.call"]({ phone: CONTACT.phone, email: CONTACT.email })}</p>
      </form>
      <Group title={m["orch.help.past"]()}>
        {reports.length === 0 && <GroupRow label={m["orch.help.empty"]()} />}
        {reports.map((r) => (
          <GroupRow key={r.id} label={r.title} detail={r.reply ? `${m["orch.help.answer"]()}: ${r.reply}` : m["orch.help.waiting"]()} value={new Date(r.createdAt).toLocaleDateString()} />
        ))}
      </Group>
    </article>
  )
}
