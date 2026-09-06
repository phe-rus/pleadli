import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Building02Icon,
  EyeIcon,
  FlowConnectionIcon,
  IdentityCardIcon,
  LockKeyIcon,
  Route01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

const principles = [
  {
    icon: IdentityCardIcon,
    title: 'One case, one identity',
    description: 'A case keeps the same identity from investigation through to custody.',
  },
  {
    icon: LockKeyIcon,
    title: 'Institution-owned records',
    description: "Each institution's records stay with that institution, always.",
  },
  {
    icon: EyeIcon,
    title: 'Referenceable, not visible',
    description: 'Other institutions can reference a case without seeing inside it.',
  },
] as const

const narrative = [
  {
    icon: FlowConnectionIcon,
    title: 'Why Pleadli exists',
    paragraphs: [
      "A single case can pass through police, prosecution, courts, and prisons, and today each of those stages usually runs on its own paperwork, with almost nothing connecting them. The same facts get re-entered at every handoff. Documents get lost between offices. Nobody outside one institution can see where a case actually stands, even when they have a legitimate reason to know.",
      "Pleadli exists to fix the connection, not to replace what each institution already does well. A case gets a shared digital identity that follows it across the whole process. What stays separate is who owns the records: police records belong to police, prosecution decisions belong to the DPP, and so on. Referenceability is not the same as visibility, and Pleadli is built to keep that distinction real.",
    ],
  },
  {
    icon: Building02Icon,
    title: 'Who Pleadli is for',
    paragraphs: [
      'Pleadli is built for institutions, not the general public. It starts with Police and the Directorate of Public Prosecutions, and is meant to extend to Courts, Prisons, and Lawyers as those institutions come online. A civilian-facing side of Pleadli is part of the long-term vision, but it is explicitly out of scope for now.',
    ],
  },
  {
    icon: Route01Icon,
    title: 'Where things stand',
    paragraphs: [
      'Pleadli is early. Pleadli Cloud, the central platform that Police and DPP will connect to, is being built first. Institutional applications for Police and DPP come next, one at a time, rather than all at once.',
    ],
  },
] as const

export const Route = createFileRoute('/_public/about')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex w-full flex-col gap-5 md:max-w-5xl">
      <section className="flex flex-col gap-5 py-20">
        <Badge variant="secondary">About</Badge>
        <h1 className="text-2xl md:max-w-2xl md:text-6xl!">
          Justice, connected without being centralized.
        </h1>
        <p className="md:max-w-2xl md:text-base!">
          Pleadli is digital infrastructure for justice systems. It gives a case one continuous
          identity as it moves between institutions, while leaving each institution in full
          control of the records it owns.
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
        {narrative.map((item) => (
          <div key={item.title} className="md:max-w-2xl">
            <HugeiconsIcon icon={item.icon} className="mb-2 text-muted-foreground" />
            <h2>{item.title}</h2>
            {item.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        ))}
      </section>

      <Separator />

      <section className="flex flex-col items-start gap-4 py-20">
        <div>
          <h2>Pleadli Cloud administration</h2>
          <p className="max-w-xl">
            Institutional users sign in through Pleadli Cloud to manage their organization,
            structure, and staff.
          </p>
        </div>
        <Button size="lg" nativeButton={false} render={<Link to="/login" />}>
          Sign in
        </Button>
      </section>
    </article>
  )
}
