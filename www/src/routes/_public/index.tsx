import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  adminNavItems,
  caseTimeline,
  homeProblems,
  homeStats,
  institutionFeatures,
  institutions,
  trustPoints,
} from '@/data/home'
import { cn } from '@/lib/utils'
import { AddCircleIcon, ArrowRight02Icon, JusticeScale01Icon, LockKeyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex w-full flex-col gap-5 md:max-w-5xl">
      <section className="flex min-h-[70vh] flex-col justify-center gap-5">
        <Badge variant="secondary">
          <HugeiconsIcon icon={JusticeScale01Icon} />
          Pleadli
        </Badge>

        <div>
          <h1 className="text-2xl md:max-w-2xl md:text-6xl!">
            One case.
            <br className="hidden sm:block" />
            Every institution keeps its own record.
          </h1>
          <p className="md:max-w-md md:text-base!">
            As a case moves from the Uganda Police Force to the DPP to court, its identity stays
            intact, while each institution keeps full ownership of the records only it should see.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button size="lg" nativeButton={false} render={<Link to="/login" />}>
            Sign in
          </Button>
          <Button size="lg" variant="secondary" nativeButton={false} render={<Link to="/about" />}>
            About Pleadli
            <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-5 py-20 md:grid-cols-3">
        {homeStats.map((stat) => (
          <div key={stat.value} className="flex flex-col items-start gap-3">
            <span className="text-6xl font-semibold tracking-tight md:text-7xl!">{stat.value}</span>
            <p className="md:max-w-xs">{stat.description}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-5 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">Justice systems weren't built to talk to each other</h2>
          <p>
            Police, prosecution, courts, and prisons each run their own paperwork today, with
            almost nothing connecting them.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {homeProblems.map((problem) => (
            <Card key={problem.title}>
              <CardHeader>
                <HugeiconsIcon icon={problem.icon} className="text-muted-foreground" />
                <CardTitle>{problem.title}</CardTitle>
                <CardDescription className="text-base!">{problem.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-5 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">A shared case identity. Institution-owned records.</h2>
          <p>
            Today the same matter can carry a station CRB number, a different DPP file number, and
            a separate court cause number, three institutions, no shared thread between them. A
            case can be referenced by every institution that legitimately touches it, without any
            institution gaining access to another's internal records. Referenceability is not the
            same as visibility.
          </p>
        </div>

        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-muted-foreground/25" />
              <span className="size-2 rounded-full bg-muted-foreground/25" />
              <span className="size-2 rounded-full bg-muted-foreground/25" />
            </div>
            <span className="font-mono text-xs text-muted-foreground">PL-2026-00001180</span>
            <Badge variant="secondary">DPP review</Badge>
          </div>
          <div className="flex flex-wrap items-start gap-y-6 p-6">
            {caseTimeline.map((step, index) => (
              <div
                key={step.label}
                className="flex basis-1/2 items-center justify-center gap-3 sm:basis-0 sm:flex-1 sm:justify-start"
              >
                <div className="flex flex-col items-center gap-2 text-center">
                  <div
                    className={cn(
                      'flex size-10 items-center justify-center rounded-full border',
                      index <= 1
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'text-muted-foreground',
                    )}
                  >
                    <HugeiconsIcon icon={step.icon} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{step.label}</span>
                    <span className="text-xs text-muted-foreground">{step.institution}</span>
                  </div>
                </div>
                {index < caseTimeline.length - 1 && (
                  <div className="hidden h-px flex-1 bg-border sm:block" />
                )}
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-10 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">Built for how each institution actually works</h2>
          <p>Police and DPP first, each with their own side of Pleadli, not a shared filter.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {institutionFeatures.map((feature) => (
            <Card key={feature.name}>
              <CardHeader className="gap-3">
                <HugeiconsIcon icon={feature.icon} className="text-muted-foreground" />
                <CardTitle>{feature.name}</CardTitle>
                <CardDescription className="text-base!">{feature.description}</CardDescription>
                <ul className="mt-2 flex flex-col gap-2">
                  {feature.points.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                      {point}
                    </li>
                  ))}
                </ul>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-5 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">Pleadli Cloud, for institutional administration</h2>
          <p>
            Each institution manages its own structure, from headquarters down to individual
            units, without touching another institution's setup.
          </p>
        </div>

        <Card className="w-full gap-0 overflow-hidden p-0 shadow-lg">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <span className="size-2 rounded-full bg-muted-foreground/25 sm:size-2.5" />
              <span className="size-2 rounded-full bg-muted-foreground/25 sm:size-2.5" />
              <span className="size-2 rounded-full bg-muted-foreground/25 sm:size-2.5" />
            </div>
            <div className="flex flex-1 justify-center overflow-hidden">
              <div className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                <HugeiconsIcon icon={LockKeyIcon} className="size-3! shrink-0" />
                <span className="truncate">pleadli.com/admin</span>
              </div>
            </div>
          </div>

          {/* Dashboard */}
          <div className="aspect-4/3 sm:aspect-video">
            <div className="grid h-full grid-cols-[76px_1fr] sm:grid-cols-[180px_1fr]">
              <div className="flex flex-col gap-1 overflow-y-auto border-r p-2 sm:p-3">
                <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold sm:px-2">
                  <HugeiconsIcon icon={JusticeScale01Icon} className="size-3.5! shrink-0" />
                  <span className="hidden truncate sm:inline">Pleadli Cloud</span>
                </div>
                {adminNavItems.map((item, index) => (
                  <div
                    key={item.label}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-1 py-1.5 text-xs sm:px-2',
                      index === 0 ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <HugeiconsIcon icon={item.icon} className="shrink-0" />
                    <span className="hidden truncate sm:inline">{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col overflow-y-auto">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-4 sm:py-3">
                  <span className="text-xs font-medium sm:text-sm">Organizations</span>
                  <Button size="sm" variant="secondary">
                    <HugeiconsIcon icon={AddCircleIcon} data-icon="inline-start" />
                    <span className="hidden sm:inline">New organization</span>
                  </Button>
                </div>
                <div className="flex flex-col gap-2 p-2 sm:gap-3 sm:p-4">
                  {institutions.slice(0, 2).map((institution) => (
                    <div
                      key={institution.name}
                      className="flex items-center gap-2 rounded-md border p-2 sm:gap-3 sm:p-3"
                    >
                      <HugeiconsIcon icon={institution.icon} className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium sm:text-sm">
                        {institution.name === 'Police' ? 'Uganda Police Force' : 'Office of the DPP'}
                      </span>
                      <Badge className="shrink-0">{institution.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-10 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">Built institution by institution</h2>
          <p>
            Pleadli is built one institution at a time, starting with Police and DPP, rather than
            attempting every institution at once.
          </p>
        </div>
        <div className="grid gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {institutions.map((institution) => (
            <Card
              key={institution.name}
              className={cn(institution.status === 'Building now' && 'border-primary/30')}
            >
              <CardHeader className="gap-4">
                <div className="flex items-center justify-between">
                  <div
                    className={cn(
                      'flex size-10 items-center justify-center rounded-lg',
                      institution.status === 'Building now'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <HugeiconsIcon icon={institution.icon} />
                  </div>
                  <Badge variant={institution.status === 'Building now' ? 'default' : 'secondary'}>
                    {institution.status}
                  </Badge>
                </div>
                <div>
                  <CardTitle>{institution.name}</CardTitle>
                  <CardDescription className="mt-1 text-base!">
                    {institution.description}
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-5 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">Built for records that matter</h2>
          <p>Justice-sector records carry real consequences. Security is architecture here, not an afterthought.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {trustPoints.map((point) => (
            <Card key={point.title}>
              <CardHeader>
                <HugeiconsIcon icon={point.icon} className="text-muted-foreground" />
                <CardTitle>{point.title}</CardTitle>
                <CardDescription className="text-base!">{point.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-start gap-4 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">Pleadli Cloud administration</h2>
          <p>
            Institutional users sign in through Pleadli Cloud to manage their organization,
            structure, and staff.
          </p>
        </div>
        <Button size="lg" nativeButton={false} render={<Link to="/login" />}>
          Sign in
          <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
        </Button>
      </section>
    </article>
  )
}
