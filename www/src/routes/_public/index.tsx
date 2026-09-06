import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { caseRecords, homeProblems, institutions } from '@/data/home'
import {
  ArrowRight02Icon,
  JusticeScale01Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { cn } from 'cn'

export const Route = createFileRoute('/_public/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex w-full flex-col gap-5 md:max-w-5xl">
      <section className="flex flex-col justify-center gap-5 min-h-[70vh]">
        <Badge variant='secondary'>
          <HugeiconsIcon icon={JusticeScale01Icon} />
          Pleadli
        </Badge>

        <div>
          <h1 className="text-4xl font-bold leading-none tracking-tighter">
            One case.
            <br className="hidden sm:block" />
            every institution keeps its own record
            <br className="hidden sm:block" />
            every record is referenced
          </h1>
          <p className="md:text-base! md:max-w-md">
            Pleadli gives a justice case a single digital identity as it moves from police to
            prosecution to court, without forcing any institution to hand over its own records to
            the others.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link to="/request-demo" className={cn(buttonVariants({ variant: "secondary" }))}>
            Request a demon
          </Link>
          <Link to="/docs" className={cn(buttonVariants({ variant: 'secondary' }))}>
            Documentation
            <HugeiconsIcon icon={ArrowRight02Icon} />
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-5 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className='text-2xl!'>
            Justice systems weren't built to talk to each other
          </h2>
          <p>
            Police, prosecution, courts, and prisons each run their own paperwork today, with
            almost nothing connecting them.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {homeProblems.map((problem) => (
            <Card key={problem.title}>
              <CardHeader>
                <HugeiconsIcon icon={problem.icon} className="text-muted-foreground" />
                <CardTitle>{problem.title}</CardTitle>
                <CardDescription className='text-base!'>{problem.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-5 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className='text-2xl!'>
            A shared case identity. Institution-owned records.
          </h2>
          <p>
            A case can be referenced by every institution that legitimately touches it, without
            any institution gaining access to another's internal records. Referenceability is not
            the same as visibility.
          </p>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-5'>
          <Card className="col-span-1 md:col-span-2">
            <CardHeader>
              <CardTitle>Case</CardTitle>
              <CardDescription className='text-base!'>A single identity, shared across institutions</CardDescription>
            </CardHeader>
          </Card>
          {caseRecords.map((record) => (
            <Card key={record.title} className="break-inside-avoid col-span-1">
              <CardHeader>
                <HugeiconsIcon icon={record.icon} className="mb-2 text-muted-foreground" />
                <CardTitle>{record.title}</CardTitle>
                <CardDescription className='text-base!'>{record.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-10 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className='text-2xl!'>
            Built institution by institution
          </h2>
          <p>
            Pleadli is built one institution at a time, starting with Police and DPP, rather than
            attempting every institution at once.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {institutions.map((institution) => (
            <Card key={institution.name} size="sm">
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <HugeiconsIcon icon={institution.icon} className="text-muted-foreground" />
                <CardTitle className="flex-1">{institution.name}</CardTitle>
                <Badge variant={institution.status === 'Building now' ? 'default' : 'secondary'}>
                  {institution.status}
                </Badge>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-start gap-4 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className='text-2xl!'>Pleadli Cloud administration</h2>
          <p>
            Institutional users sign in through Pleadli Cloud to manage their organization,
            structure, and staff.
          </p>
        </div>
        <Button size="lg" render={<Link to="/login" />}>
          Sign in
          <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
        </Button>
      </section>
    </article>
  )
}
