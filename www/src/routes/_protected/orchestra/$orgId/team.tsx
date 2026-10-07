import { inviteAdministrator, removeAdministrator } from '@/functions/orchestra.func'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Input } from '@pleadli/ui/input'
import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_protected/orchestra/$orgId/team')({
  component: RouteComponent,
})

const institutionRoute = getRouteApi('/_protected/orchestra/$orgId')

function RouteComponent() {
  const { institution, members, role } = institutionRoute.useLoaderData()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const owner = role === 'owner'

  const invite = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await inviteAdministrator({ data: { organizationId: institution.id, email } })
      t.success(m["orch.team.invited_ok"]())
      setEmail('')
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
        <h1>{m["orch.nav.team"]()}</h1>
        <p className="text-muted-foreground">{m["orch.team.lead"]()}</p>
      </header>
      <Group>
        {members.map((p) => (
          <GroupRow
            key={p.id}
            label={p.email}
            detail={p.status === 'invited' ? m["orch.team.invited"]() : p.role === 'owner' ? m["orch.team.owner"]() : m["orch.team.admin"]()}
            value={
              owner && p.role === 'admin' ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={async () => {
                    await removeAdministrator({ data: { organizationId: institution.id, memberId: p.id } })
                    void router.invalidate()
                  }}
                >
                  {m["orch.team.remove"]()}
                </Button>
              ) : undefined
            }
          />
        ))}
      </Group>
      {owner ? (
        <form onSubmit={invite} className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-border/70">
          <h2 className="text-base! font-semibold">{m["orch.team.invite"]()}</h2>
          <p className="text-sm text-muted-foreground">{m["orch.team.invite_hint"]()}</p>
          <div className="flex gap-2">
            <Input required type="email" placeholder={m["orch.team.email"]()} value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" disabled={busy}>
              {m["orch.team.send"]()}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">{m["orch.team.owner_only"]()}</p>
      )}
    </article>
  )
}
