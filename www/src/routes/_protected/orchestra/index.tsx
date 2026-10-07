import { getMyOrchestra } from '@/functions/orchestra.func'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'

/** /orchestra: straight to the institution this person manages, to
 * registration when they manage none, or a choice when they manage several. */
export const Route = createFileRoute('/_protected/orchestra/')({
  loader: async () => {
    const mine = await getMyOrchestra()
    if (mine.institutions.length === 0) throw redirect({ to: '/orchestra/register' })
    if (mine.institutions.length === 1) throw redirect({ to: '/orchestra/$orgId', params: { orgId: mine.institutions[0].id } })
    return mine
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { institutions } = Route.useLoaderData()
  return (
    <article className="container flex flex-col gap-6 py-16 md:max-w-2xl">
      <h1>{m["orch.choose_title"]()}</h1>
      <Group>
        {institutions.map((i) => (
          <GroupRow key={i.id} label={i.name} detail={i.address ?? m["orch.status.pending_title"]()} chevron render={({ className, children }) => <Link to="/orchestra/$orgId" params={{ orgId: i.id }} className={className}>{children}</Link>} />
        ))}
      </Group>
      <Button variant="secondary" className="w-fit" nativeButton={false} render={<Link to="/orchestra/register" />}>
        {m["orch.add_another"]()}
      </Button>
    </article>
  )
}
