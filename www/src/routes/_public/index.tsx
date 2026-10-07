import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import {
  getAdminNavItems,
  getApplicationSpotlight,
  getCaseRecords,
  getHomeProblems,
  getHomeStats,
  getScalingChains,
  getTrustPoints,
} from '@/data/home'
import { getProducts, getReadinessLabel } from '@/data/products'
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
import * as m from '@/paraglide/messages'

export const Route = createFileRoute('/_public/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex w-full flex-col gap-5 md:max-w-5xl">
      <section className="flex min-h-[70vh] flex-col justify-center gap-5">
        <Badge variant="secondary">
          <HugeiconsIcon icon={JusticeScale01Icon} />
          Pleadli · {m["site.slogan"]()}
        </Badge>

        <div>
          <h1 className="text-2xl md:max-w-2xl md:text-5xl!">
            {m["home.hero_title_1"]()}
            <br className="hidden sm:block" />
            {m["home.hero_title_2"]()}
          </h1>
          <p className="md:max-w-md md:text-base!">
            {m["home.hero_lead"]()}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button size="lg" nativeButton={false} render={<Link to="/downloads" />}>
            {m["home.download"]()}
          </Button>
          <Button size="lg" variant="outline" nativeButton={false} render={<Link to="/login" />}>
            {m["nav.sign_in"]()}
          </Button>
          <Button size="lg" variant="secondary" nativeButton={false} render={<Link to="/about" />}>
            {m["home.about"]()}
            <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-5 py-20 md:grid-cols-3">
        {getHomeStats().map((stat) => (
          <div key={stat.value} className="flex flex-col items-start gap-3">
            <span className="text-6xl font-semibold tracking-tight md:text-7xl!">{stat.value}</span>
            <p className="md:max-w-xs">{stat.description}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-5 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">{m["home.problems_title"]()}</h2>
          <p>{m["home.problems_lead"]()}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {getHomeProblems().map((problem) => (
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
          <h2 className="text-2xl!">{m["home.case_title"]()}</h2>
          <p>{m["home.case_lead"]()}</p>
        </div>

        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-muted-foreground/25" />
              <span className="size-2 rounded-full bg-muted-foreground/25" />
              <span className="size-2 rounded-full bg-muted-foreground/25" />
            </div>
            <span className="font-mono text-xs text-muted-foreground">{getCaseRecords().caseId}</span>
            <Badge variant="secondary">{m["home.case_badge"]()}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
            {getCaseRecords().records.map((record) => (
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
          <h2 className="text-2xl!">{m["home.apps_title"]()}</h2>
          <p>{m["home.apps_lead"]()}</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {getProducts().map((product) => (
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
                    {getReadinessLabel()[product.readiness]}
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
                  {m["home.learn_more"]()}
                  <HugeiconsIcon icon={ArrowRight02Icon} className="size-3.5! transition-transform group-hover:translate-x-0.5" />
                </span>
              </Card>
            </Link>
          ))}
        </div>
        <p className="text-sm text-muted-foreground md:max-w-lg">
          {m["home.apps_note"]()}
        </p>
      </section>

      <section className="flex flex-col gap-10 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">{m["home.purpose_title"]()}</h2>
          <p>{m["home.purpose_lead"]()}</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {getApplicationSpotlight().map((feature) => (
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
          <h2 className="text-2xl!">{m["home.platform_title"]()}</h2>
          <p>{m["home.platform_lead"]()}</p>
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
                {getAdminNavItems().map((item, index) => (
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
                  <span className="text-xs font-medium sm:text-sm">{m["home.mock_organizations"]()}</span>
                  <Button size="sm" variant="secondary">
                    <HugeiconsIcon icon={AddCircleIcon} data-icon="inline-start" />
                    <span className="hidden sm:inline">{m["home.mock_new_org"]()}</span>
                  </Button>
                </div>
                <div className="flex flex-col gap-2 p-2 sm:gap-3 sm:p-4">
                  {getProducts().slice(0, 2).map((product) => (
                    <div
                      key={product.slug}
                      className="flex items-center gap-2 rounded-md border p-2 sm:gap-3 sm:p-3"
                    >
                      <HugeiconsIcon icon={product.icon} className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium sm:text-sm">
                        {product.name}
                      </span>
                      <Badge className="shrink-0">{getReadinessLabel()[product.readiness]}</Badge>
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
          <h2 className="text-2xl!">{m["home.scale_title"]()}</h2>
          <p>{m["home.scale_lead"]()}</p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {getScalingChains().map((chain) => (
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
          <h2 className="text-2xl!">{m["home.trust_title"]()}</h2>
          <p>{m["home.trust_lead"]()}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {getTrustPoints().map((point) => (
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
          <h2 className="text-2xl!">{m["home.stand_title"]()}</h2>
          <p className="md:max-w-md">{m["home.stand_lead"]()}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Button variant="secondary" nativeButton={false} render={<Link to="/roadmap" />}>
            <HugeiconsIcon icon={Route02Icon} data-icon="inline-start" />
            {m["nav.roadmap"]()}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link to="/downloads" />}>
            <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
            {m["nav.downloads"]()}
          </Button>
        </div>
      </section>

      <section className="flex flex-col items-start gap-4 py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">{m["home.signin_title"]()}</h2>
          <p>{m["home.signin_lead"]()}</p>
        </div>
        <Button size="lg" nativeButton={false} render={<Link to="/login" />}>
          {m["nav.sign_in"]()}
          <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
        </Button>
      </section>
    </article>
  )
}
