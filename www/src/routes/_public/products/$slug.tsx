import { seo } from '@/lib/seo'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card } from '@pleadli/ui/card'
import { Separator } from '@pleadli/ui/separator'
import { type CapabilityNote, type Product, productBySlug, getProducts, getReadinessLabel } from '@/data/products'
import {
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
  CircleIcon,
  Download01Icon,
  MinusSignCircleIcon,
  WifiOff02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import * as m from '@/paraglide/messages'
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
    return seo({ title, description, path: `/products/${loaderData.slug}` })
  },
  component: RouteComponent,
})

const tileTints = ['bg-primary/10 text-primary', 'bg-emerald-500/10 text-emerald-600', 'bg-amber-500/10 text-amber-600'] as const

/** The workspace as the desktop apps draw it: title bar with the app's mark,
 * Chrome-style tabs, a navigator of folding sections with count chips, stat
 * tiles, and a status bar. Real labels from the app's own menu, sample data.
 * Labelled as a mockup so it never reads as a claim about exact pixels. */
function ProductMockup({ product }: { product: Product }) {
  const { mockup } = product
  const today = mockup.sections[0]?.items[0]
  return (
    <Card className="w-full gap-0 overflow-hidden rounded-xl p-0 shadow-lg">
      {/* Title bar: mark, name and office on the left, tabs, theme on the right. */}
      <div className="flex h-9 items-stretch border-b bg-background">
        <div className="flex w-[92px] shrink-0 items-center gap-2 px-2.5 sm:w-[180px]">
          <HugeiconsIcon icon={product.icon} className="size-4! shrink-0 text-primary" />
          <div className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="truncate text-[0.7rem] font-semibold">{product.name}</span>
            <span className="truncate text-[0.6rem] text-muted-foreground">{mockup.statusLeft}</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-end gap-0.5 px-1">
          {[today, mockup.tab].filter((t, i, a) => t && a.indexOf(t) === i).map((t) => (
            <span
              key={t}
              className={cn(
                'flex h-7 max-w-[9rem] items-center truncate rounded-t-md px-2.5 text-[0.65rem]',
                t === mockup.tab ? 'border-b-2 border-primary bg-muted/60 font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {t}
            </span>
          ))}
        </div>
        <span className="hidden items-center pr-3 text-[0.6rem] text-muted-foreground sm:flex">
          <HugeiconsIcon icon={WifiOff02Icon} className="mr-1 size-2.5!" />
          {m["product.mock_local"]()}
        </span>
      </div>

      <div className="aspect-4/3 sm:aspect-video">
        <div className="grid h-full grid-cols-[92px_1fr] sm:grid-cols-[180px_1fr]">
          {/* Navigator. */}
          <div className="flex flex-col gap-2 overflow-hidden border-r bg-muted/20 p-1.5 sm:gap-2.5 sm:p-2">
            <div className="hidden h-6 items-center rounded-md border border-border/60 bg-background px-2 text-[0.6rem] text-muted-foreground sm:flex">{m["product.mock_search"]()}</div>
            {mockup.sections.map((section, si) => (
              <div key={section.label} className="flex flex-col gap-0.5">
                <span className="hidden items-center justify-between px-1.5 text-[0.55rem] font-semibold tracking-wider text-muted-foreground/70 uppercase sm:flex">
                  {section.label}
                  <span aria-hidden>⌄</span>
                </span>
                {section.items.map((item, ii) => (
                  <div
                    key={item}
                    className={cn(
                      'flex items-center justify-between gap-1 truncate rounded-md px-1.5 py-1 text-[0.65rem] sm:px-2',
                      item === mockup.tab ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={cn('size-2.5 shrink-0 rounded-[3px] border', item === mockup.tab ? 'border-primary/60' : 'border-muted-foreground/40')} />
                      <span className="truncate">{item}</span>
                    </span>
                    {si === 0 && ii === 1 && <span className="rounded-full bg-destructive/15 px-1 text-[0.55rem] text-destructive">2</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* The page in view. */}
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-1 flex-col gap-2.5 overflow-hidden p-2.5 sm:gap-3 sm:p-4">
              <div className="flex flex-col">
                <span className="truncate text-sm font-bold sm:text-lg">{mockup.tab}</span>
                <span className="hidden truncate text-[0.65rem] text-muted-foreground sm:block">{mockup.subtitle}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {mockup.stats.map((stat, i) => (
                  <div key={stat.label} className="flex flex-col gap-1 rounded-lg border bg-card p-1.5 sm:p-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full sm:size-5', tileTints[i % 3])}>
                        <span className="size-1.5 rounded-full bg-current" />
                      </span>
                      <span className="truncate text-[0.55rem] text-muted-foreground sm:text-[0.65rem]">{stat.label}</span>
                    </div>
                    <span className="text-base font-semibold tabular-nums sm:text-2xl">{stat.value}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2 sm:p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[0.7rem] font-semibold sm:text-sm">{mockup.row.title}</span>
                    <span className="truncate text-[0.6rem] text-muted-foreground sm:text-xs">{mockup.row.meta}</span>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0 bg-destructive/10 text-destructive">{mockup.row.pill}</Badge>
              </div>
            </div>
            {/* Status bar. */}
            <div className="flex h-6 items-center justify-between gap-2 border-t px-2.5 text-[0.55rem] text-muted-foreground sm:text-[0.6rem]">
              <span className="truncate">{mockup.statusLeft}</span>
              <span className="shrink-0">{mockup.statusRight}</span>
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
          {note.state === true ? m["product.real_today"]() : note.state === 'partial' ? m["product.partial"]() : m["product.not_built"]()}
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
            {getReadinessLabel()[product.readiness]}
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
          {m["product.mockup_note"]()}
        </p>
      </section>

      <section className="flex flex-col gap-3 py-10">
        <h2 className="text-xl!">{m["product.problem"]()}</h2>
        <p className="md:max-w-2xl">{product.problem}</p>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-5 md:p-6">
        <h2 className="text-sm! font-medium tracking-wide text-primary uppercase">{m["product.in_use"]()}</h2>
        <p className="md:max-w-2xl">{product.usage}</p>
      </section>

      <section className="grid grid-cols-1 gap-8 py-10 md:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-3">
          <h2 className="text-xl!">{m["product.who_for"]()}</h2>
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
          <h2 className="text-xl!">{m["product.owns"]()}</h2>
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
          <h2 className="text-2xl!">{m["product.workflows"]()}</h2>
          <p>{m["product.workflows_lead"]()}</p>
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
        <h2 className="text-xl!">{m["product.features"]()}</h2>
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
          <h2 className="text-2xl!">{m["product.stands"]()}</h2>
          <p>{m["product.stands_lead"]()}</p>
        </div>
        <Card className="p-5">
          <CapabilityRow label={m["product.cap_offline"]()} note={product.offline} />
          <CapabilityRow label={m["product.cap_security"]()} note={product.security} />
          <CapabilityRow label={m["product.cap_documents"]()} note={product.documents} />
          <CapabilityRow label={m["product.cap_ai"]()} note={product.ai} />
        </Card>
      </section>

      <section className="flex flex-col gap-4 py-10">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-xl!">{m["product.ahead"]()}</h2>
          <p className="text-sm text-muted-foreground">{m["product.ahead_lead"]()}</p>
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
        <h2 className="text-xl!">{m["product.connecting"]()}</h2>
        <p className="md:max-w-2xl text-muted-foreground">{product.interchange}</p>
      </section>

      <section className="flex flex-col items-start gap-4 py-16 md:py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">{m["product.download_title"]({ name: product.name })}</h2>
          <p>
            {product.download.platforms.join(m["product.and"]())}. {product.download.state}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {product.download.release ? (
            <Button size="lg" nativeButton={false} render={<a href={product.download.release.url} target="_blank" rel="noreferrer" />}>
              <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
              {m["product.download_windows"]()}
            </Button>
          ) : (
            <Button size="lg" variant="secondary" disabled>
              <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
              {m["product.not_available"]()}
            </Button>
          )}
          <Button size="lg" variant="outline" nativeButton={false} render={<Link to="/roadmap" />}>
            {m["product.see_roadmap"]()}
            <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-border/60 py-10">
        <h2 className="text-lg! text-muted-foreground">{m["product.others"]()}</h2>
        <div className="flex flex-wrap gap-2">
          {getProducts()
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
