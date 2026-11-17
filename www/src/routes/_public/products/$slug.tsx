import { seo } from '@/lib/seo'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card } from '@pleadli/ui/card'
import { Separator } from '@pleadli/ui/separator'
import { type CapabilityNote, productBySlug, getProducts, getReadinessLabel } from '@/data/products'
import {
  Download01Icon,
  CheckmarkCircle02Icon,
  CircleIcon,
  MinusSignCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import * as m from '@/paraglide/messages'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { getReleases } from '@/functions/releases.func'
import { cn } from '@pleadli/ui/lib/utils'
import { MorphWindow } from '@/components/morph-window'
import { ProductPreview } from '@/components/product-preview'
import { Reveal } from '@/components/reveal'
import { productPresentation } from '@/data/product-presentation'
import { DownloadActions } from '@/components/download-actions'

const wrap = 'container w-full md:max-w-6xl'

export const Route = createFileRoute('/_public/products/$slug')({
  loader: async ({ params }) => {
    const product = productBySlug(params.slug)
    if (!product) throw notFound()
    // A release needs both a feed and a published installer.
    const live = await getReleases()
    return { slug: product.slug, availability: live[product.slug] ?? { status: 'unavailable' as const } }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const product = productBySlug(loaderData.slug)
    if (!product) return {}
    return seo({ title: `${product.name} · Pleadli`, description: `${product.tagline} ${product.problem}`, path: `/products/${product.slug}` })
  },
  component: RouteComponent,
})


function CapabilityRow({ label, note }: { label: string; note: CapabilityNote }) {
  const icon = note.state === true ? CheckmarkCircle02Icon : note.state === 'partial' ? MinusSignCircleIcon : CircleIcon
  return (
    <div className={cn(
      'flex flex-col gap-1.5 border-b border-border/60 py-4',
      'last:border-0',
    )}>
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
  const { slug, availability } = Route.useLoaderData()
  const product = productBySlug(slug)!
  const story = productPresentation(slug)
  const hasScreens = true

  return (
    <article className="flex flex-col">
      <div className="flow-root bg-muted/60">
        <section className={cn(wrap, 'pt-12 md:pt-16')}>
          <Reveal immediate className="flex max-w-4xl flex-col items-start gap-5">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl border border-border/60 bg-background text-primary-ink">
                <HugeiconsIcon icon={product.icon} className="size-6!" />
              </span>
              <Badge variant={product.readiness === 'building' ? 'default' : 'secondary'}>{getReadinessLabel()[product.readiness]}</Badge>
            </div>
            <h1 className="text-4xl! font-semibold tracking-tight md:text-5xl!">{product.name}</h1>
            <p className="text-2xl! font-normal leading-snug! tracking-tight md:text-3xl!">
              <span className="font-medium text-primary-ink">{story.title}</span> {story.lead}
            </p>
            <p className="text-sm text-muted-foreground">{product.institution}</p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button size="lg" className="rounded-md px-5" nativeButton={false} render={<a href="#download" />}>
                <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
                {m['product.download_title']({ name: product.name })}
              </Button>
              <Button size="lg" variant="ghost" className="rounded-md" nativeButton={false} render={<Link to="/roadmap" />}>
                {m['product.see_roadmap']()}
              </Button>
            </div>
          </Reveal>
        </section>
        <Reveal immediate className={cn(wrap, 'relative z-10 mt-10 -mb-24 md:-mb-40')}>
          <div className="mx-auto max-w-4xl">
            {hasScreens ? (
              <ProductPreview product={product} />
            ) : (
              <figure className="flex flex-col gap-5">
                <MorphWindow product={product} />
                <figcaption className="mx-auto max-w-xl text-center text-xs leading-relaxed text-muted-foreground">{m['product.mockup_note']()}</figcaption>
              </figure>
            )}
          </div>
        </Reveal>
      </div>

      <div className={cn(wrap, 'flex flex-col gap-5 pt-32 md:pt-56')}>
        <section className="grid divide-y divide-border/60 border-y border-border/60 md:grid-cols-3 md:divide-x md:divide-y-0">
          {product.homePoints.map((point, index) => (
            <Reveal key={point} delay={index * 0.06} className="flex flex-col gap-3 py-8 md:px-8 md:first:pl-0 md:last:pr-0">
              <span className="text-sm font-semibold text-primary-ink">0{index + 1}</span>
              <p className="text-lg! font-medium leading-snug!">{point}</p>
            </Reveal>
          ))}
        </section>
      <section className="pt-16 md:pt-24">
        <h2 className="text-3xl! font-bold tracking-tight md:text-4xl!">{m['preview.details']()}</h2>
      </section>
      <div className="flex flex-col divide-y divide-border/60">
      <section className="flex flex-col gap-3 py-10">
        <h2 className="text-xl!">{m["product.problem"]()}</h2>
        <p className="md:max-w-2xl">{product.problem}</p>
      </section>

      <section className={cn(
        'flex flex-col gap-3 rounded-lg border border-primary/20',
        'bg-primary/5 p-5 md:p-6',
      )}>
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
                <span className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full',
                  'bg-primary/10 text-xs font-semibold text-primary',
                )}>
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
            <div key={feature} className={cn(
              'flex items-start gap-2 rounded-lg border p-3',
              'text-sm',
            )}>
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
            <li key={item} className={cn(
              'flex items-start gap-2 rounded-lg border border-dashed',
              'p-3 text-sm text-muted-foreground',
            )}>
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

      </div>

      <section id="download" className="flex scroll-mt-24 flex-col items-start gap-5 py-16 md:py-24">
        <div className="flex max-w-xl flex-col gap-3">
          <h2 className="text-3xl! font-bold tracking-tight">{m['product.download_title']({ name: product.name })}</h2>
          <p className="text-base! leading-relaxed text-muted-foreground">
            {product.download.platforms.join(m['product.and']())}. {product.download.state}
          </p>
        </div>
        <DownloadActions name={product.name} availability={availability} align="start" />
      </section>

      <section className="flex flex-col gap-4 border-t border-border/60 py-10">
        <h2 className="text-base! font-medium text-muted-foreground">{m['product.others']()}</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {getProducts()
            .filter((p) => p.slug !== product.slug)
            .map((p) => (
              <Link key={p.slug} to="/products/$slug" params={{ slug: p.slug }} className="inline-flex items-center gap-2 text-base font-medium text-primary-ink hover:underline">
                <HugeiconsIcon icon={p.icon} className="size-4!" />
                {p.name}
              </Link>
            ))}
        </div>
      </section>
      </div>
    </article>
  )
}
