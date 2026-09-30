import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import {
  adminNavItems,
  applicationSpotlight,
  caseRecords,
  homeProblems,
  homeStats,
  scalingChains,
  trustPoints,
} from '@/data/home'
import { products, readinessLabel } from '@/data/products'
import { cn } from '@pleadli/ui/lib/utils'
import {
  AddCircleIcon,
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
  Download01Icon,
  JusticeScale01Icon,
  LockKeyIcon,
  Route02Icon,
} from '@hugeicons/core-free-icons'
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
          Pleadli · Justice, Law and Order Orchestra
        </Badge>

        <div>
          <h1 className="text-2xl md:max-w-2xl md:text-5xl!">
            Justice requires institutions to work together,
            <br className="hidden sm:block" />
            without becoming the same institution.
          </h1>
          <p className="md:max-w-md md:text-base!">
            Pleadli gives police, prosecutors, courts, lawyers, and prisons software built around
            their own work, while keeping the matters they legitimately share connected.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button size="lg" nativeButton={false} render={<Link to="/downloads" />}>
            Download
          </Button>
          <Button size="lg" variant="outline" nativeButton={false} render={<Link to="/login" />}>
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
          <h2 className="text-2xl!">One case, many records</h2>
          <p>
            A case can be referenced by every application that legitimately touches it, without
            any application gaining access to another's internal records. One case does not mean
            one shared file. Connection does not mean universal visibility.
          </p>
        </div>

        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-muted-foreground/25" />
              <span className="size-2 rounded-full bg-muted-foreground/25" />
              <span className="size-2 rounded-full bg-muted-foreground/25" />
            </div>
            <span className="font-mono text-xs text-muted-foreground">{caseRecords.caseId}</span>
            <Badge variant="secondary">Pleadli case</Badge>
          </div>
          <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
            {caseRecords.records.map((record) => (
              <div key={record.application} className="flex flex-col gap-2 bg-card p-4">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={record.icon} className="size-4! shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium">{record.application}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono text-xs text-muted-foreground">{record.reference}</span>
                  <span className="text-xs text-muted-foreground">{record.activity}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-10 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">Software for the people who keep justice moving</h2>
          <p>
            Each Pleadli application is designed around real work, not a generic dashboard reused
            across institutions.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Link key={product.slug} to="/products/$slug" params={{ slug: product.slug }} className="group">
              <Card className="h-full gap-5 p-5 transition-colors group-hover:border-primary/40">
                <div className="flex items-center justify-between">
                  <div
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg',
                      product.readiness === 'building' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <HugeiconsIcon icon={product.icon} />
                  </div>
                  <Badge variant={product.readiness === 'building' ? 'default' : 'secondary'} className="w-fit">
                    {readinessLabel[product.readiness]}
                  </Badge>
                </div>
                <div>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription className="text-base!">{product.homeFocus}</CardDescription>
                </div>
                <ul className="flex flex-col gap-2 pl-0 [&>li]:pl-0">
                  {product.homePoints.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="mt-0.5 size-3.5! shrink-0 text-primary" />
                      {point}
                    </li>
                  ))}
                </ul>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Learn more
                  <HugeiconsIcon icon={ArrowRight02Icon} className="size-3.5! transition-transform group-hover:translate-x-0.5" />
                </span>
              </Card>
            </Link>
          ))}
        </div>
        <p className="text-sm text-muted-foreground md:max-w-lg">
          Pleadli Police and Pleadli DPP come first because investigation, referral, perusal, and
          prosecution form a useful early end-to-end connection, not because the other
          applications are later stages of one product.
        </p>
      </section>

      <section className="flex flex-col gap-10 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">Purpose-built, not shared</h2>
          <p>Pleadli Police and Pleadli DPP each have their own side of Pleadli, not a shared filter.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {applicationSpotlight.map((feature) => (
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
          <h2 className="text-2xl!">One platform underneath</h2>
          <p>
            Identity, organizations, access, and provisioning for every Pleadli application live
            in one place, so each institution manages its own structure without touching another
            institution's setup.
          </p>
        </div>

        <Card className="w-full gap-0 overflow-hidden p-0 shadow-lg">
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

          <div className="aspect-4/3 sm:aspect-video">
            <div className="grid h-full grid-cols-[76px_1fr] sm:grid-cols-[200px_1fr]">
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
                    <HugeiconsIcon icon={item.icon} className="shrink-0 size-3.5" />
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
                  {products.slice(0, 2).map((product) => (
                    <div
                      key={product.slug}
                      className="flex items-center gap-2 rounded-md border p-2 sm:gap-3 sm:p-3"
                    >
                      <HugeiconsIcon icon={product.icon} className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium sm:text-sm">
                        {product.name}
                      </span>
                      <Badge className="shrink-0">{readinessLabel[product.readiness]}</Badge>
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
          <h2 className="text-2xl!">One user, one team, one institution</h2>
          <p>
            The same Pleadli application can serve an individual, a team, or a larger
            organization. The hierarchy differs by institution, Pleadli doesn't force one shape
            onto all of them.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {scalingChains.map((chain) => (
            <div key={chain.title} className="flex flex-col gap-3">
              <span className="text-sm font-medium text-muted-foreground">{chain.title}</span>
              <div className="flex flex-wrap items-center gap-2">
                {chain.steps.map((step, index) => (
                  <div key={step.label} className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5">
                      <HugeiconsIcon icon={step.icon} className="size-3.5! shrink-0 text-muted-foreground" />
                      <span className="text-xs font-medium">{step.label}</span>
                    </div>
                    {index < chain.steps.length - 1 && (
                      <HugeiconsIcon icon={ArrowRight02Icon} className="size-3.5! shrink-0 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            </div>
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

      <section className="flex flex-col gap-5 border-t border-border/60 py-20 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl!">See where things actually stand</h2>
          <p className="md:max-w-md">
            A live, honestly-scored roadmap across all five applications, and what downloading
            each one looks like today.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Button variant="secondary" nativeButton={false} render={<Link to="/roadmap" />}>
            <HugeiconsIcon icon={Route02Icon} data-icon="inline-start" />
            Roadmap
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link to="/downloads" />}>
            <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
            Downloads
          </Button>
        </div>
      </section>

      <section className="flex flex-col items-start gap-4 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">Sign in to Pleadli</h2>
          <p>
            Institutional users sign in to manage their organization, structure, and staff across
            the applications they use.
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
