import { getAdminOverview } from '@/functions/admin.func'
import { Building02Icon, LayoutTemplateIcon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/admin/')({
  loader: () => getAdminOverview(),
  component: RouteComponent,
})

function RouteComponent() {
  const { organizations, totalUsers, users, templateCount, orgsByType } = Route.useLoaderData()

  const stats = [
    { icon: Building02Icon, label: 'Organizations', value: organizations.length },
    { icon: LayoutTemplateIcon, label: 'Templates', value: templateCount },
    { icon: UserGroupIcon, label: 'Users', value: totalUsers },
  ]

  const typeBreakdown = Object.entries(orgsByType)

  return (
    <article className="container flex flex-col gap-5 py-10 md:max-w-5xl">
      <section className='flex flex-col gap-5'>
        <div>
          <h1>Overview</h1>
          <p className="text-muted-foreground md:max-w-md">The whole Pleadli ecosystem, at a glance.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          {stats.map((stat) => (
            <Card key={stat.label} className={cn(
              'bg-accent/15 border-border/15! min-w-3xs',
              'max-w-3xs'
            )}>
              <CardHeader>
                <HugeiconsIcon icon={stat.icon} className="text-muted-foreground" />
                <CardTitle className="text-2xl">{stat.value}</CardTitle>
                <CardDescription>{stat.label}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div>
          <h1>Recently joined</h1>
          <p className="text-muted-foreground md:max-w-md">The latest additions to the Pleadli platform.</p>
        </div>
        <div className="flex flex-col gap-1">
          {users.slice(0, 5).map((user, index) => (
            <Card key={index} className={cn(
              "gap-0 py-1! px-1! bg-secondary/35",
              'ring-border/55!'
            )}>
              <div className={cn(
                "flex items-center gap-4 not-last:border-b",
                'justify-between'
              )}>
                <div className="flex items-center gap-1">
                  <span className="text-xs bg-secondary px-2 py-0.5 rounded font-mono">
                    {user.id}
                  </span>
                  <span className="text-xs font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-xs px-1 rounded',
                    user.emailVerified ? "bg-green-400" : "bg-red-400"
                  )}>
                    {user.emailVerified ? "Verified" : "Not Verified"}
                  </span>
                </div>
              </div>
            </Card>
          ))}
          {users.length === 0 && <p className="p-3 text-sm text-muted-foreground">No users yet.</p>}
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div>
          <h1>Organizations by type</h1>
          <p className="text-muted-foreground md:max-w-md">How the ecosystem is distributed across institution types.</p>
        </div>
        {typeBreakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No organizations yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {typeBreakdown.map(([type, count]) => (
              <Badge key={type} variant="outline" className="px-3 py-1 capitalize">
                {type} <span className="text-muted-foreground">{count}</span>
              </Badge>
            ))}
          </div>
        )}
      </section>
    </article>
  )
}
