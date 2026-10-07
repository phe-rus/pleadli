import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { Separator } from '@pleadli/ui/separator'
import { pillars, principles } from '@/data/about'
import * as m from '@/paraglide/messages'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/about')({
  head: () => ({
    meta: [
      { title: m["about.meta_title"]() },
      { name: 'description', content: m["about.meta_description"]() },
    ],
  }),
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex w-full flex-col gap-5 md:max-w-5xl">
      <section className="flex flex-col gap-5 py-20">
        <Badge variant="secondary">{m["about.badge"]()} · {m["site.slogan"]()}</Badge>
        <h1 className="text-2xl md:max-w-2xl md:text-6xl!">{m["site.motto"]()}</h1>
        <p className="md:max-w-2xl md:text-base!">{m["about.lead"]()}</p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {principles.map((principle) => (
          <Card key={principle.id}>
            <CardHeader>
              <HugeiconsIcon icon={principle.icon} className="text-muted-foreground" />
              <CardTitle>{principle.title}</CardTitle>
              <CardDescription className="text-base!">{principle.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Separator />

      <section className="flex flex-col gap-10 py-20">
        {pillars.map((pillar) => (
          <div key={pillar.id} className="md:max-w-2xl">
            <HugeiconsIcon icon={pillar.icon} className="mb-2 text-muted-foreground" />
            <h2>{pillar.title}</h2>
            {pillar.paragraphs.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        ))}

        <p className="text-sm text-muted-foreground md:max-w-xl">{m["about.first_note"]()}</p>
      </section>

      <Separator />

      <section className="flex flex-col items-start gap-4 py-20">
        <div>
          <h2>{m["about.sign_in_title"]()}</h2>
          <p className="max-w-xl">{m["about.sign_in_body"]()}</p>
        </div>
        <Button size="lg" nativeButton={false} render={<Link to="/login" />}>
          {m["nav.sign_in"]()}
        </Button>
      </section>
    </article>
  )
}
