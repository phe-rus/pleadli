import { seo } from '@/lib/seo'
import * as m from '@/paraglide/messages'
import { Card, CardDescription, CardTitle } from '@pleadli/ui/card'
import { createFileRoute } from '@tanstack/react-router'
import { cn } from '@pleadli/ui/lib/utils'

export const Route = createFileRoute('/_public/docs/postbox')({
  head: () => seo({ title: `${m["docs.postbox.title"]()} · Pleadli`, description: m["docs.postbox.lead"](), path: '/docs/postbox' }),
  component: RouteComponent,
})

const steps = [
  { id: 'seal', get title() { return m["docs.postbox.steps.seal.title"]() }, get body() { return m["docs.postbox.steps.seal.body"]() } },
  { id: 'post', get title() { return m["docs.postbox.steps.post.title"]() }, get body() { return m["docs.postbox.steps.post.body"]() } },
  { id: 'collect', get title() { return m["docs.postbox.steps.collect.title"]() }, get body() { return m["docs.postbox.steps.collect.body"]() } },
  { id: 'progress', get title() { return m["docs.postbox.steps.progress.title"]() }, get body() { return m["docs.postbox.steps.progress.body"]() } },
] as const

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
          {item}
        </li>
      ))}
    </ul>
  )
}

/** The Postbox is a design, not a feature: this page says so first and
 * describes it in the future tense (docs/platform/RELAY-DESIGN.md). */
function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl!">{m["docs.postbox.title"]()}</h1>
        <p>{m["docs.postbox.lead"]()}</p>
      </div>

      <div className={cn('flex flex-col gap-1 rounded-lg border border-primary/30 bg-primary/5 p-4')}>
        <h2 className="text-base!">{m["docs.postbox.status_title"]()}</h2>
        <p className="text-sm text-muted-foreground">{m["docs.postbox.status_body"]()}</p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl!">{m["docs.postbox.steps_title"]()}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {steps.map((step, i) => (
            <div key={step.id}>
              <Card className="h-full p-4">
                <span className="text-xs text-muted-foreground">{i + 1}</span>
                <CardTitle>{step.title}</CardTitle>
                <CardDescription className="text-sm">{step.body}</CardDescription>
              </Card>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.postbox.rules_title"]()}</h2>
        <List items={[m["docs.postbox.rules.reads"](), m["docs.postbox.rules.removed"](), m["docs.postbox.rules.strangers"](), m["docs.postbox.rules.licence"]()]} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.postbox.limits_title"]()}</h2>
        <List items={[m["docs.postbox.limits.metadata"](), m["docs.postbox.limits.location"](), m["docs.postbox.limits.down"](), m["docs.postbox.limits.design"]()]} />
      </div>
    </div>
  )
}
