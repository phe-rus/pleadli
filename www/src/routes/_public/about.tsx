import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/about')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container mx-auto flex max-w-3xl flex-col gap-16 py-16 md:py-24">
      <section className="flex flex-col">
        <Badge variant='secondary'>About</Badge>
        <h1 className="text-2xl md:text-6xl! md:max-w-2xl">Justice, connected without being centralized.</h1>
        <p>
          Pleadli is digital infrastructure for justice systems. It gives a case one continuous
          identity as it moves between institutions, while leaving each institution in full
          control of the records it owns.
        </p>
      </section>

      <Separator />

      <section className="flex flex-col gap-10">
        <div>
          <h2>Why Pleadli exists</h2>
          <p>
            A single case can pass through police, prosecution, courts, and prisons, and today
            each of those stages usually runs on its own paperwork, with almost nothing
            connecting them. The same facts get re-entered at every handoff. Documents get lost
            between offices. Nobody outside one institution can see where a case actually stands,
            even when they have a legitimate reason to know.
          </p>
          <p>
            Pleadli exists to fix the connection, not to replace what each institution already
            does well. A case gets a shared digital identity that follows it across the whole
            process. What stays separate is who owns the records: police records belong to
            police, prosecution decisions belong to the DPP, and so on. Referenceability is not
            the same as visibility, and Pleadli is built to keep that distinction real.
          </p>
        </div>

        <div>
          <h2>Who Pleadli is for</h2>
          <p>
            Pleadli is built for institutions, not the general public. It starts with Police and
            the Directorate of Public Prosecutions, and is meant to extend to Courts, Prisons, and
            Lawyers as those institutions come online. A civilian-facing side of Pleadli is part
            of the long-term vision, but it is explicitly out of scope for now.
          </p>
        </div>

        <div>
          <h2>Where things stand</h2>
          <p>
            Pleadli is early. Pleadli Cloud, the central platform that Police and DPP will connect
            to, is being built first. Institutional applications for Police and DPP come next, one
            at a time, rather than all at once.
          </p>
        </div>
      </section>

      <Separator />

      <section className="flex flex-col items-start gap-4">
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
