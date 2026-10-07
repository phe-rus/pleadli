import { seo } from '@/lib/seo'
import { Card } from '@pleadli/ui/card'
import * as m from '@/paraglide/messages'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/roadmap')({
  head: () => seo({ title: `${m["roadmap.title"]().replace(/\.$/, "")} · Pleadli`, description: m["roadmap.lead"](), path: '/roadmap' }),
  component: RouteComponent,
})

const horizons = [
  { label: () => m["roadmap.h_now"](), items: [() => m["roadmap.now.1"](), () => m["roadmap.now.2"](), () => m["roadmap.now.3"](), () => m["roadmap.now.4"]()], tone: 'bg-primary text-primary-foreground' },
  { label: () => m["roadmap.h_next"](), items: [() => m["roadmap.next.1"](), () => m["roadmap.next.2"](), () => m["roadmap.next.3"](), () => m["roadmap.next.4"]()], tone: 'bg-primary/15 text-primary' },
  { label: () => m["roadmap.h_later"](), items: [() => m["roadmap.later.1"](), () => m["roadmap.later.2"](), () => m["roadmap.later.3"]()], tone: 'bg-muted text-muted-foreground' },
]

const apps = [
  { name: 'Pleadli Police', ready: () => m["roadmap.app.police.ready"](), coming: () => m["roadmap.app.police.coming"]() },
  { name: 'Pleadli DPP', ready: () => m["roadmap.app.dpp.ready"](), coming: () => m["roadmap.app.dpp.coming"]() },
  { name: 'Pleadli Courts', ready: () => m["roadmap.app.courts.ready"](), coming: () => m["roadmap.app.courts.coming"]() },
  { name: 'Pleadli Lawyers', ready: () => m["roadmap.app.lawyers.ready"](), coming: () => m["roadmap.app.lawyers.coming"]() },
  { name: 'Pleadli Prisons', ready: () => m["roadmap.app.prisons.ready"](), coming: () => m["roadmap.app.prisons.coming"]() },
]

/** Where Pleadli is going: the Orchestra's now, next and later, then each
 * app's ready-today and coming, in plain words. Ready means run and checked. */
function RouteComponent() {
  return (
    <article className="container flex w-full flex-col md:max-w-5xl">
      <section className="flex flex-col gap-5 py-16 md:py-24">
        <h1 className="text-3xl tracking-tight md:max-w-3xl md:text-5xl!">{m["roadmap.title"]()}</h1>
        <p className="md:max-w-2xl md:text-lg!">{m["roadmap.lead"]()}</p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {horizons.map((h) => (
          <Card key={h.label()} className="gap-4 p-6">
            <span className={cn('w-fit rounded-full px-3 py-1 text-xs font-semibold', h.tone)}>{h.label()}</span>
            <ul className="flex flex-col gap-3 pl-0">
              {h.items.map((item, i) => (
                <li key={i} className="flex gap-2 pl-0">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
                  <span>{item()}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-6 py-20">
        <h2 className="text-2xl! md:text-3xl! tracking-tight">{m["roadmap.apps_title"]()}</h2>
        <div className="flex flex-col divide-y divide-border/60 border-y border-border/60">
          {apps.map((app) => (
            <div key={app.name} className="grid grid-cols-1 gap-3 py-6 md:grid-cols-[12rem_1fr_1fr] md:gap-8">
              <h3 className="text-base! font-semibold">{app.name}</h3>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold tracking-wide text-primary uppercase">{m["roadmap.ready"]()}</span>
                <p>{app.ready()}</p>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{m["roadmap.coming"]()}</span>
                <p>{app.coming()}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </article>
  )
}
