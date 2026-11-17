import { inviteAdministrator, removeAdministrator } from '@/functions/orchestra.func'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Input } from '@pleadli/ui/input'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'
import { cn } from '@pleadli/ui/lib/utils'
import { useServerMutation } from '@/lib/use-server-mutation'

export const Route = createFileRoute('/_protected/orchestra/$orgId/team')({
  component: RouteComponent,
})

const institutionRoute = getRouteApi('/_protected/orchestra/$orgId')

function RouteComponent() {
  const { institution, members, role } = institutionRoute.useLoaderData()
  const [email, setEmail] = useState('')
  const owner = role === 'owner'
  const inviteMutation = useServerMutation(inviteAdministrator, {
    success: () => m["orch.team.invited_ok"](),
    onSuccess: () => setEmail(''),
  })
  const removeMutation = useServerMutation(removeAdministrator)
  const busy = inviteMutation.isPending

  const invite = (event: React.FormEvent) => {
    event.preventDefault()
    inviteMutation.mutate({ organizationId: institution.id, email })
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
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate({ organizationId: institution.id, memberId: p.id })}
                >
                  {m["orch.team.remove"]()}
                </Button>
              ) : undefined
            }
          />
        ))}
      </Group>
      {owner ? (
        <form onSubmit={invite} className={cn(
          'flex flex-col gap-3 rounded-2xl bg-card p-5',
          'ring-1 ring-border/70',
        )}>
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
