import { NativeSelect } from '@/components/native-select'
import { CONTACT } from '@/data/contact'
import { appLabel } from '@/data/orchestra'
import { writeToPleadli } from '@/functions/account.func'
import { APPLICATIONS } from '@/lib/orchestra'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Input } from '@pleadli/ui/input'
import { Textarea } from '@pleadli/ui/textarea'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'
import { cn } from '@pleadli/ui/lib/utils'
import { useServerMutation } from '@/lib/use-server-mutation'

export const Route = createFileRoute('/_protected/account/$orgId/help')({
  component: RouteComponent,
})

const institutionRoute = getRouteApi('/_protected/account/$orgId')

function RouteComponent() {
  const { institution, reports } = institutionRoute.useLoaderData()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [application, setApplication] = useState<string>('')
  const sendMutation = useServerMutation(writeToPleadli, {
    success: () => m["orch.help.sent"](),
    onSuccess: () => {
      setTitle('')
      setBody('')
    },
  })
  const busy = sendMutation.isPending

  const send = (event: React.FormEvent) => {
    event.preventDefault()
    sendMutation.mutate({ organizationId: institution.id, title, body, application: (application || undefined) as (typeof APPLICATIONS)[number] | undefined })
  }

  return (
    <article className="container flex flex-col gap-6 py-10 md:max-w-4xl">
      <header>
        <h1>{m["orch.nav.help"]()}</h1>
        <p className="text-muted-foreground">{m["orch.help.lead"]()}</p>
      </header>
      <form onSubmit={send} className={cn(
        'flex flex-col gap-3 rounded-2xl bg-card p-5',
        'ring-1 ring-border/70',
      )}>
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
