import { seo } from '@/lib/seo'
import * as m from '@/paraglide/messages'
import { Building03Icon, Certificate01Icon, Mail01Icon, Search01Icon, ShieldUserIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/docs/how-it-works')({
  head: () => seo({ title: `${m["docs.how.title"]()} · Pleadli`, description: m["docs.how.lead"](), path: '/docs/how-it-works' }),
  component: RouteComponent,
})

/** The post office, drawn: a station seals, the relay holds, the prosecutor
 * opens. Plain boxes in the site's colours, readable on a phone. */
function PostOffice() {
  const box = 'flex flex-col gap-1 rounded-2xl bg-card p-4 ring-1 ring-border'
  return (
    <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
      <div className={box}>
        <span className="text-sm font-semibold">{m["docs.how.fig.station"]()}</span>
        <span className="text-sm text-muted-foreground">{m["docs.how.fig.station_do"]()}</span>
      </div>
      <span className="text-center text-primary">→</span>
      <div className={`${box} bg-primary/[0.07] ring-primary/20`}>
        <span className="text-sm font-semibold">{m["docs.how.fig.relay"]()}</span>
        <span className="text-sm text-muted-foreground">{m["docs.how.fig.relay_do"]()}</span>
      </div>
      <span className="text-center text-primary">→</span>
      <div className={box}>
        <span className="text-sm font-semibold">{m["docs.how.fig.dpp"]()}</span>
        <span className="text-sm text-muted-foreground">{m["docs.how.fig.dpp_do"]()}</span>
      </div>
    </div>
  )
}

const sections = [
  { icon: Building03Icon, title: () => m["docs.how.apps_title"](), body: [() => m["docs.how.apps_body"]()] },
  { icon: Mail01Icon, title: () => m["docs.how.post_title"](), body: [() => m["docs.how.post_p1"](), () => m["docs.how.post_p2"](), () => m["docs.how.post_p3"]()], figure: true },
  { icon: Certificate01Icon, title: () => m["docs.how.address_title"](), body: [() => m["docs.how.address_body"]()] },
  { icon: ShieldUserIcon, title: () => m["docs.how.country_title"](), body: [() => m["docs.how.country_body"]()] },
  { icon: Search01Icon, title: () => m["docs.how.public_title"](), body: [() => m["docs.how.public_body"]()] },
]

function RouteComponent() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl! tracking-tight">{m["docs.how.title"]()}</h1>
        <p>{m["docs.how.lead"]()}</p>
      </div>
      {sections.map((section) => (
        <section key={section.title()} className="flex flex-col gap-3">
          <HugeiconsIcon icon={section.icon} className="text-primary" />
          <h2 className="text-xl!">{section.title()}</h2>
          {section.figure && <PostOffice />}
          {section.body.map((text, i) => (
            <p key={i}>{text()}</p>
          ))}
        </section>
      ))}
      <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
        {m["docs.how.status_note"]()}{' '}
        <Link to="/roadmap" className="font-medium text-primary">{m["nav.roadmap"]()} →</Link>
      </p>
    </div>
  )
}
