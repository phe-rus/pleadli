import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { Separator } from '@pleadli/ui/separator'
import { pillars, principles } from '@/data/about'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/about')({
  head: () => ({
    meta: [
      { title: 'About · Pleadli' },
      {
        name: 'description',
        content:
          "Pleadli exists to provide the digital infrastructure that makes justice institutions work together without becoming the same institution: software built for each participant's own work, connected only where a legitimate relationship exists.",
      },
    ],
  }),
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex w-full flex-col gap-5 md:max-w-5xl">
      <section className="flex flex-col gap-5 py-20">
        <Badge variant="secondary">About</Badge>
        <h1 className="text-2xl md:max-w-2xl md:text-6xl!">
          Justice requires institutions to work together, without becoming the same institution.
        </h1>
        <p className="md:max-w-2xl md:text-base!">
          Pleadli exists to provide the digital infrastructure that makes that possible: software
          built for each participant's own work, connected only where a legitimate relationship
          exists.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {principles.map((principle) => (
          <Card key={principle.title}>
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
          <div key={pillar.title} className="md:max-w-2xl">
            <HugeiconsIcon icon={pillar.icon} className="mb-2 text-muted-foreground" />
            <h2>{pillar.title}</h2>
            {pillar.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        ))}

        <p className="text-sm text-muted-foreground md:max-w-xl">
          Pleadli Police and Pleadli DPP are being built first because investigation, referral,
          perusal, and prosecution form a useful early end-to-end connection, not because Courts,
          Lawyers, and Prisons are later stages of the same product. They are separate
          applications that will be built when their own product requirements are ready.
        </p>
      </section>

      <Separator />

      <section className="flex flex-col items-start gap-4 py-20">
        <div>
          <h2>Sign in to Pleadli</h2>
          <p className="max-w-xl">
            Institutional users sign in to Pleadli to manage their organization, structure, and
            staff.
          </p>
        </div>
        <Button size="lg" nativeButton={false} render={<Link to="/login" />}>
          Sign in
        </Button>
      </section>
    </article>
  )
}
