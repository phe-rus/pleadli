import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card } from '@pleadli/ui/card'
import { Separator } from '@pleadli/ui/separator'
import { type CapabilityNote, type Product, productBySlug, products, readinessLabel } from '@/data/products'
import {
  AlertCircleIcon,
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
  CircleIcon,
  Download01Icon,
  MinusSignCircleIcon,
  WifiOff02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { cn } from 'cn'

export const Route = createFileRoute('/_public/products/$slug')({
  loader: ({ params }) => {
    const product = productBySlug(params.slug)
    if (!product) throw notFound()
    return product
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const title = `${loaderData.name} · Pleadli`
    const description = `${loaderData.tagline} ${loaderData.problem}`
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
    }
  },
  component: RouteComponent,
})

/** A stylized representation of the workspace: real design-system components,
 * the app's real navigation and vocabulary, sample data. Not a screenshot,
 * labelled as a mockup so it never reads as a claim about exact pixels. */
function ProductMockup({ product }: { product: Product }) {
  const { mockup } = product
  return (
    <Card className="w-full gap-0 overflow-hidden p-0 shadow-lg">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
        <div className="flex items-center gap-1 sm:gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground/25 sm:size-2.5" />
          <span className="size-2 rounded-full bg-muted-foreground/25 sm:size-2.5" />
          <span className="size-2 rounded-full bg-muted-foreground/25 sm:size-2.5" />
        </div>
        <div className="flex flex-1 items-center justify-center gap-1.5 overflow-hidden text-xs font-medium text-muted-foreground">
          <HugeiconsIcon icon={product.icon} className="size-3.5! shrink-0" />
          <span className="truncate">{product.name}</span>
        </div>
        <span className="hidden shrink-0 items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[0.625rem] text-muted-foreground sm:flex">
          <HugeiconsIcon icon={WifiOff02Icon} className="size-2.5!" />
          Local
        </span>
      </div>

      <div className="aspect-4/3 sm:aspect-video">
        <div className="grid h-full grid-cols-[76px_1fr] sm:grid-cols-[168px_1fr]">
          <div className="flex flex-col gap-2.5 overflow-y-auto border-r p-2 sm:gap-3 sm:p-3">
            <span className="hidden truncate px-1 text-[0.625rem] font-medium text-muted-foreground sm:block">{mockup.subtitle}</span>
            {mockup.sections.map((section) => (
              <div key={section.label} className="flex flex-col gap-0.5">
                <span className="hidden truncate px-1 text-[0.625rem] font-semibold tracking-wide text-muted-foreground/70 uppercase sm:block">
                  {section.label}
                </span>
                {section.items.map((item) => (
                  <div
                    key={item}
                    className={cn(
                      'truncate rounded-md px-1 py-1.5 text-xs sm:px-2',
                      item === mockup.tab ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <span className="hidden sm:inline">{item}</span>
                    <span className="sm:hidden">{item.slice(0, 3)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 overflow-y-auto p-2 sm:p-4">
            <div className="hidden items-center justify-between gap-2 text-xs sm:flex">
              <span className="truncate font-medium">{mockup.statusLeft}</span>
              <span className="shrink-0 text-muted-foreground">{mockup.statusRight}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {mockup.stats.map((stat) => (
                <div key={stat.label} className="flex flex-col gap-0.5 rounded-md border bg-card p-2">
                  <span className="text-sm font-semibold sm:text-lg">{stat.value}</span>
                  <span className="truncate text-[0.625rem] text-muted-foreground sm:text-xs">{stat.label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border bg-card p-2 sm:p-3">
              <div className="flex min-w-0 items-center gap-2">
                <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5! shrink-0 text-primary" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-medium sm:text-sm">{mockup.row.title}</span>
                  <span className="truncate text-[0.625rem] text-muted-foreground sm:text-xs">{mockup.row.meta}</span>
                </div>
              </div>
              <Badge className="shrink-0">{mockup.row.pill}</Badge>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function CapabilityRow({ label, note }: { label: string; note: CapabilityNote }) {
  const icon = note.state === true ? CheckmarkCircle02Icon : note.state === 'partial' ? MinusSignCircleIcon : CircleIcon
  return (
    <div className="flex flex-col gap-1.5 border-b border-border/60 py-4 last:border-0">
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={icon}
          className={cn(
            'size-4!',
            note.state === true && 'text-primary',
            note.state === 'partial' && 'text-muted-foreground',
            note.state === false && 'text-muted-foreground/50',
          )}
        />
        <span className="font-medium">{label}</span>
        <Badge variant={note.state === true ? 'default' : note.state === 'partial' ? 'secondary' : 'outline'} className="ml-auto">
          {note.state === true ? 'Real today' : note.state === 'partial' ? 'Partial' : 'Not built'}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{note.detail}</p>
    </div>
  )
}

function RouteComponent() {
  const product = Route.useLoaderData()

  return (
    <article className="container flex w-full flex-col gap-5 md:max-w-5xl">
      <section className="flex flex-col gap-5 py-16 md:py-20">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={product.icon} className="size-6!" />
          </div>
          <Badge variant={product.readiness === 'building' ? 'default' : 'secondary'}>
            {readinessLabel[product.readiness]}
          </Badge>
        </div>
        <div>
          <h1 className="text-3xl md:max-w-2xl md:text-5xl!">{product.name}</h1>
          <p className="md:max-w-xl md:text-base!">{product.tagline}</p>
        </div>
        <p className="text-sm text-muted-foreground">{product.institution}</p>
      </section>

      <section className="pb-10">
        <ProductMockup product={product} />
        <p className="mt-2 text-xs text-muted-foreground">
          A stylized representation of the real workspace, built from real navigation and sample data, not a screenshot.
        </p>
      </section>

      <section className="flex flex-col gap-3 py-10">
        <h2 className="text-xl!">The problem</h2>
        <p className="md:max-w-2xl">{product.problem}</p>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-5 md:p-6">
        <h2 className="text-sm! font-medium tracking-wide text-primary uppercase">In use</h2>
        <p className="md:max-w-2xl">{product.usage}</p>
      </section>

      <section className="grid grid-cols-1 gap-8 py-10 md:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-3">
          <h2 className="text-xl!">Who it's for</h2>
          <ul className="flex flex-col gap-1.5">
            {product.whoFor.map((role) => (
              <li key={role} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                {role}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-xl!">What it owns</h2>
          <ul className="flex flex-wrap gap-1.5">
            {product.ownsRecords.map((record) => (
              <Badge key={record} variant="outline">
                {record}
              </Badge>
            ))}
          </ul>
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-8 py-10">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">Major workflows</h2>
          <p>How the application is actually used, not a generic feature list.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {product.workflows.map((workflow, index) => (
            <div key={workflow.title} className="relative flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                {index < product.workflows.length - 1 && (
                  <span className="hidden h-px flex-1 bg-border md:block" aria-hidden="true" />
                )}
              </div>
              <h3 className="text-base font-medium">{workflow.title}</h3>
              <p className="text-sm text-muted-foreground">{workflow.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 py-10">
        <h2 className="text-xl!">Features</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {product.features.map((feature) => (
            <div key={feature} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="mt-0.5 size-4! shrink-0 text-primary" />
              {feature}
            </div>
          ))}
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-4 py-10">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">Where it actually stands</h2>
          <p>Honest, capability by capability. Not built is a real answer here, not a gap we hide.</p>
        </div>
        <Card className="p-5">
          <CapabilityRow label="Offline" note={product.offline} />
          <CapabilityRow label="Security" note={product.security} />
          <CapabilityRow label="Documents" note={product.documents} />
          <CapabilityRow label="AI" note={product.ai} />
        </Card>
      </section>

      <section className="flex flex-col gap-4 py-10">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-xl!">What's still ahead</h2>
          <p className="text-sm text-muted-foreground">Not a hidden roadmap: the specific, named gaps closest to the surface right now.</p>
        </div>
        <ul className="flex flex-col gap-2">
          {product.notYetBuilt.map((item) => (
            <li key={item} className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              <HugeiconsIcon icon={CircleIcon} className="mt-0.5 size-3.5! shrink-0 text-muted-foreground/50" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 py-10">
        <h2 className="text-xl!">Connecting to other applications</h2>
        <p className="md:max-w-2xl text-muted-foreground">{product.interchange}</p>
      </section>

      <section className="flex flex-col items-start gap-4 py-16 md:py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">Download {product.name}</h2>
          <p>
            {product.download.platforms.join(' and ')}. {product.download.state}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" variant="secondary" disabled>
            <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
            Download
          </Button>
          <Button size="lg" nativeButton={false} render={<Link to="/roadmap" />}>
            See the roadmap
            <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-border/60 py-10">
        <h2 className="text-lg! text-muted-foreground">Other applications</h2>
        <div className="flex flex-wrap gap-2">
          {products
            .filter((p) => p.slug !== product.slug)
            .map((p) => (
              <Link
                key={p.slug}
                to="/products/$slug"
                params={{ slug: p.slug }}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={p.icon} className="size-3.5!" />
                {p.name}
              </Link>
            ))}
        </div>
      </section>
    </article>
  )
}
