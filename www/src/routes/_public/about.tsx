import { seo } from '@/lib/seo'
import { CONTACT } from '@/data/contact'
import { Button } from '@pleadli/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { pillars, principles } from '@/data/about'
import * as m from '@/paraglide/messages'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/about')({
  head: () => seo({ title: m["about.meta_title"](), description: m["about.meta_description"](), path: '/about' }),
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex w-full flex-col md:max-w-5xl">
      <section className="flex flex-col gap-5 py-16 md:py-24">
        <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{m["about.badge"]()} · {m["site.slogan"]()}</span>
        <h1 className="text-3xl leading-[1.1] tracking-tight md:max-w-3xl md:text-5xl!">{m["site.motto"]()}</h1>
        <p className="md:max-w-2xl md:text-lg!">{m["about.lead"]()}</p>
      </section>

      <section className="grid grid-cols-1 gap-10 border-t border-border/60 py-16 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl! tracking-tight">{m["about.what_title"]()}</h2>
          <p>{m["about.what_p1"]()}</p>
          <p>{m["about.what_p2"]()}</p>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl! tracking-tight">{m["about.why_title"]()}</h2>
          <p>{m["about.why_p1"]()}</p>
          <p>{m["about.why_p2"]()}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 py-8 sm:grid-cols-3">
        {principles.map((principle) => (
          <Card key={principle.id}>
            <CardHeader className="gap-2">
              <HugeiconsIcon icon={principle.icon} className="text-primary" />
              <CardTitle>{principle.title}</CardTitle>
              <CardDescription className="text-base!">{principle.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-x-12 gap-y-10 py-16 md:grid-cols-2">
        {pillars.map((pillar) => (
          <div key={pillar.id} className="flex flex-col gap-2">
            <HugeiconsIcon icon={pillar.icon} className="text-primary" />
            <h3 className="text-lg! font-semibold">{pillar.title}</h3>
            {pillar.paragraphs.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3 border-t border-border/60 py-16 md:max-w-2xl">
        <h2 className="text-2xl! tracking-tight">{m["about.where_title"]()}</h2>
        <p>{m["about.where_p1"]()}</p>
      </section>

      <section className="py-16">
        <div className="flex flex-col gap-6 rounded-3xl bg-primary/[0.07] p-6 ring-1 ring-primary/15 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl! tracking-tight">{m["about.who_title"]()}</h2>
            <p className="text-lg font-semibold text-foreground">{CONTACT.person}</p>
            <p>{m["contact.founder"]()}, Pleadli</p>
            <p className="text-sm">
              <a href={`mailto:${CONTACT.email}`} className="hover:text-primary">{CONTACT.email}</a> · <a href={`tel:${CONTACT.phoneE164}`} className="hover:text-primary">{CONTACT.phone}</a>
            </p>
          </div>
          <Button size="lg" className="w-fit" nativeButton={false} render={<Link to="/contact" />}>
            {m["about.who_cta"]()}
          </Button>
        </div>
      </section>
    </article>
  )
}
