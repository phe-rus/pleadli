import { decideConnection, getPostbox } from '@/functions/postbox.func'
import { useServerMutation } from '@/lib/use-server-mutation'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/account/$orgId/postbox')({
  loader: ({ params }) => getPostbox({ data: { organizationId: params.orgId } }),
  component: RouteComponent,
})

const institutionRoute = getRouteApi('/_protected/account/$orgId')

/** Connections between offices: who asks, who is connected. Contents of mail
 * never appear here, because Pleadli cannot read them. */
function RouteComponent() {
  const { institution } = institutionRoute.useLoaderData()
  const { links, waiting } = Route.useLoaderData()
  const decide = useServerMutation(decideConnection, { success: () => m["orch.postbox.done"]() })
  const act = (linkId: string, action: 'approve' | 'decline' | 'revoke') => decide.mutate({ organizationId: institution.id, linkId, action })

  const asking = links.filter((l) => l.status === 'requested' && l.direction === 'asked_of_us')
  const sent = links.filter((l) => l.status === 'requested' && l.direction === 'asked')
  const live = links.filter((l) => l.status === 'approved')
  const ended = links.filter((l) => l.status === 'declined' || l.status === 'revoked')

  return (
    <article className="container flex flex-col gap-6 py-10 md:max-w-4xl">
      <header>
        <h1>{m["orch.nav.postbox"]()}</h1>
        <p className="text-muted-foreground">{m["orch.postbox.lead"]()}</p>
      </header>
      <p className="rounded-xl bg-foreground/[0.04] px-4 py-3 text-sm text-muted-foreground">{m["orch.postbox.note"]()}</p>

      <Group>
        <GroupRow label={m["orch.postbox.waiting"]()} value={waiting} />
      </Group>

      {!links.length && <p className="text-sm text-muted-foreground">{m["orch.postbox.empty"]()}</p>}

      {asking.length > 0 && (
        <Group title={m["orch.postbox.asking_title"]()}>
          {asking.map((l) => (
            <GroupRow
              key={l.id}
              label={l.name}
              detail={`${l.address} · ${m["orch.postbox.ask_detail"]()}`}
              value={
                <>
                  <Button size="xs" disabled={decide.isPending} onClick={() => act(l.id, 'approve')}>{m["orch.postbox.approve"]()}</Button>
                  <Button size="xs" variant="ghost" disabled={decide.isPending} onClick={() => act(l.id, 'decline')}>{m["orch.postbox.decline"]()}</Button>
                </>
              }
            />
          ))}
        </Group>
      )}

      {live.length > 0 && (
        <Group title={m["orch.postbox.connected_title"]()} footer={m["orch.postbox.revoke_hint"]()}>
          {live.map((l) => (
            <GroupRow
              key={l.id}
              label={l.name}
              detail={l.address}
              value={<Button size="xs" variant="ghost" disabled={decide.isPending} onClick={() => act(l.id, 'revoke')}>{m["orch.postbox.revoke"]()}</Button>}
            />
          ))}
        </Group>
      )}

      {sent.length > 0 && (
        <Group title={m["orch.postbox.sent_title"]()}>
          {sent.map((l) => (
            <GroupRow key={l.id} label={l.name} detail={l.address} />
          ))}
        </Group>
      )}

      {ended.length > 0 && (
        <Group title={m["orch.postbox.ended_title"]()}>
          {ended.map((l) => (
            <GroupRow key={l.id} label={l.name} detail={l.address} value={l.status === 'declined' ? m["orch.postbox.declined"]() : m["orch.postbox.revoked"]()} />
          ))}
        </Group>
      )}
    </article>
  )
}
