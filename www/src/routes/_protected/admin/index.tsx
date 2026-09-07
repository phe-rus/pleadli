import { getAdminOverview } from '@/functions/admin.func'
import { Building02Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/admin/')({
  loader: () => getAdminOverview(),
  component: RouteComponent,
})

function RouteComponent() {
  const { organizations, totalUsers, users } = Route.useLoaderData()

  const stats = [
    { icon: Building02Icon, label: 'Organizations', value: organizations.length },
    { icon: UserGroupIcon, label: 'Users', value: totalUsers },
  ]

  return (
    <article className="container flex flex-col gap-5 py-10 md:max-w-5xl">
      <section>
        <h1>Overview</h1>
        <p className="text-muted-foreground">The whole Pleadli ecosystem, at a glance.</p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:max-w-md">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <HugeiconsIcon icon={stat.icon} className="text-muted-foreground" />
              <CardTitle className="text-2xl">{stat.value}</CardTitle>
              <CardDescription>{stat.label}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h1>Recently joined</h1>
          <p className="text-muted-foreground">The latest additions to the Pleadli platform.</p>
        </div>
        <Card className="gap-0 p-2">
          {users.slice(0, 5).map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between px-3 py-3 text-sm not-last:border-b"
            >
              <span className="font-medium">{user.name}</span>
              <span className="text-muted-foreground">{user.email}</span>
            </div>
          ))}
          {users.length === 0 && <p className="p-3 text-sm text-muted-foreground">No users yet.</p>}
        </Card>
      </section>
    </article>
  )
}
