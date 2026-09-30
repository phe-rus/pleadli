import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardTitle } from '@pleadli/ui/card'
import { roadmap, roadmapStatusLabel, type RoadmapStatus } from '@/data/roadmap'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/roadmap')({
  component: RouteComponent,
})

const statusStyle: Record<RoadmapStatus, string> = {
  done: 'border-primary/30 bg-primary/5',
  'in-progress': 'border-border',
  planned: 'border-border',
  research: 'border-dashed border-border',
}

const badgeVariant: Record<RoadmapStatus, 'default' | 'secondary' | 'outline'> = {
  done: 'default',
  'in-progress': 'secondary',
  planned: 'outline',
  research: 'outline',
}

function RouteComponent() {
  const grouped = roadmap.reduce<Record<string, typeof roadmap>>((acc, item) => {
    ;(acc[item.application] ??= []).push(item)
    return acc
  }, {})

  return (
    <article className="container flex w-full flex-col gap-5 md:max-w-5xl">
      <section className="flex flex-col gap-5 py-16 md:py-20">
        <Badge variant="secondary">Roadmap</Badge>
        <h1 className="text-2xl md:max-w-2xl md:text-5xl!">What's real, what's next, what's still research.</h1>
        <p className="md:max-w-lg md:text-base!">
          An item only moves to "shipped" once it has actually run and been verified, not merely
          written. This page is regenerated from the same audit the team runs against its own
          code, it isn't marketing copy.
        </p>
      </section>

      <section className="flex flex-col gap-10 pb-20">
        {Object.entries(grouped).map(([application, items]) => (
          <div key={application} className="flex flex-col gap-3">
            <h2 className="text-xl!">{application}</h2>
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <Card key={item.title} className={cn('gap-2 p-4', statusStyle[item.status])}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                    <Badge variant={badgeVariant[item.status]} className="shrink-0">
                      {roadmapStatusLabel[item.status]}
                    </Badge>
                  </div>
                  {item.note && <CardDescription className="text-sm">{item.note}</CardDescription>}
                </Card>
              ))}
            </div>
          </div>
        ))}
      </section>
    </article>
  )
}
