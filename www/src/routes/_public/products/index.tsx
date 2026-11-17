import { productPresentation } from '@/data/product-presentation'
import { seo } from '@/lib/seo'
import { getProducts, getReadinessLabel, type CapabilityNote } from '@/data/products'
import { getReleases } from '@/functions/releases.func'
import { CheckmarkCircle02Icon, CircleIcon, Download01Icon, MinusSignCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pleadli/ui/table'
import * as m from '@/paraglide/messages'
import { createFileRoute, Link } from '@tanstack/react-router'
import { cn } from '@pleadli/ui/lib/utils'
import { LinkArrow } from '@/components/link-arrow'
import { Reveal } from '@/components/reveal'

export const Route = createFileRoute('/_public/products/')({
  head: () => seo({ title: m['seo.products_title'](), description: m['products.lead'](), path: '/products' }),
  loader: () => getReleases(),
  component: RouteComponent,
})

const wrap = 'container w-full md:max-w-6xl'

function State({ note }: { note: CapabilityNote }) {
  const icon = note.state === true ? CheckmarkCircle02Icon : note.state === 'partial' ? MinusSignCircleIcon : CircleIcon
  const label = note.state === true ? m['product.real_today']() : note.state === 'partial' ? m['product.partial']() : m['product.not_built']()
  return (
    <span className="flex items-center gap-2 text-sm">
      <HugeiconsIcon
        icon={icon}
        className={cn('size-4! shrink-0', note.state === true ? 'text-primary-ink' : 'text-muted-foreground/60')}
      />
      <span className={note.state === true ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </span>
  )
}

function RouteComponent() {
  const live = Route.useLoaderData()
  const products = getProducts()
  const readiness = getReadinessLabel()
  const rows: { label: string; note: (product: (typeof products)[number]) => CapabilityNote }[] = [
    { label: m['product.cap_offline'](), note: (product) => product.offline },
    { label: m['product.cap_security'](), note: (product) => product.security },
    { label: m['product.cap_documents'](), note: (product) => product.documents },
    { label: m['product.cap_ai'](), note: (product) => product.ai },
  ]

  return (
    <article className="flex flex-col">
      <section className={cn(wrap, 'pb-10 pt-14', 'md:pb-14 md:pt-20')}>
        <Reveal immediate className="flex max-w-3xl flex-col items-start gap-4">
          <h1 className="text-4xl! font-semibold tracking-[-0.04em] md:text-6xl!">{m['products.title']()}</h1>
          <p className="text-base! leading-relaxed text-muted-foreground md:text-lg!">{m['products.lead']()}</p>
        </Reveal>
      </section>

      <section className="border-y border-border/60 bg-muted/60" aria-label={m['nav.products']()}>
        <div className={cn(wrap, 'grid gap-4 py-10', 'md:grid-cols-2 md:py-14')}>
          {products.map((product, index) => {
            const story = productPresentation(product.slug)
            const release = live[product.slug]
            return (
              <Reveal key={product.slug} delay={(index % 2) * 0.06} className="h-full">
                <Link
                  to="/products/$slug"
                  params={{ slug: product.slug }}
                  className={cn(
                    'group flex h-full flex-col gap-5 rounded-2xl border border-border/60 bg-card',
                    'p-7 text-foreground transition-shadow hover:shadow-md',
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-3 text-sm font-semibold">
                      <span className="grid size-10 place-items-center rounded-lg border border-border/60 bg-muted text-primary-ink">
                        <HugeiconsIcon icon={product.icon} className="size-5!" />
                      </span>
                      <span className="flex flex-col leading-tight">
                        {product.name}
                        <span className="text-xs font-normal text-muted-foreground">{product.institution}</span>
                      </span>
                    </span>
                    <Badge variant={product.readiness === 'building' ? 'default' : 'secondary'}>{readiness[product.readiness]}</Badge>
                  </span>

                  <span className="text-2xl! font-bold leading-tight! tracking-tight text-foreground">{story.title}</span>
                  <span className="text-base! leading-relaxed text-muted-foreground">{story.lead}</span>

                  <span className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
                    <span className="text-xs font-semibold text-muted-foreground">{m['product.who_for']()}</span>
                    <span className="text-sm leading-relaxed">{product.whoFor.slice(0, 3).join(' · ')}</span>
                  </span>

                  <span className="mt-auto flex items-center justify-between gap-3 pt-1 text-sm">
                    <span className="font-medium text-primary-ink group-hover:underline">
                      {m['home.learn_more']()} <LinkArrow />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {release?.status === 'available' ? `Windows · v${release.version}` : m['downloads.not_available']()}
                    </span>
                  </span>
                </Link>
              </Reveal>
            )
          })}
        </div>
      </section>

      <section className={cn(wrap, 'flex flex-col gap-8 py-16 md:py-24')} aria-labelledby="compare-title">
        <Reveal className="flex max-w-2xl flex-col gap-3">
          <h2 id="compare-title" className="text-3xl! font-bold tracking-tight md:text-4xl!">{m['product.stands']()}</h2>
          <p className="text-lg! leading-relaxed text-muted-foreground">{m['product.stands_lead']()}</p>
        </Reveal>
        <Reveal className="overflow-x-auto rounded-2xl border border-border/60 bg-card">
          <Table className="min-w-[44rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-44" />
                {products.map((product) => (
                  <TableHead key={product.slug} className="px-4 py-3 text-sm font-semibold text-foreground">
                    <Link to="/products/$slug" params={{ slug: product.slug }} className="hover:underline">{product.name.replace('Pleadli ', '')}</Link>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="px-4 py-4 text-sm font-medium">{row.label}</TableCell>
                  {products.map((product) => (
                    <TableCell key={product.slug} className="px-4 py-4"><State note={row.note(product)} /></TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="px-4 py-4 text-sm font-medium">{m['nav.downloads']()}</TableCell>
                {products.map((product) => {
                  const release = live[product.slug]
                  return (
                    <TableCell key={product.slug} className="px-4 py-4 text-sm text-muted-foreground">
                      {release?.status === 'available' ? `v${release.version}` : m['downloads.not_available']()}
                    </TableCell>
                  )
                })}
              </TableRow>
            </TableBody>
          </Table>
        </Reveal>
      </section>

      <section className="border-t border-border/60 bg-muted/60">
        <Reveal className={cn(wrap, 'flex flex-col items-start gap-5 py-20', 'md:py-28')}>
          <h2 className="max-w-2xl text-3xl! font-bold tracking-tight md:text-5xl!">{m['launch.close']()}</h2>
          <p className="max-w-lg text-lg! text-muted-foreground">{m['launch.close_lead']()}</p>
          <Button size="lg" className="mt-2 rounded-md px-5" nativeButton={false} render={<Link to="/downloads" />}>
            <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
            {m['launch.choose']()}
          </Button>
        </Reveal>
      </section>
    </article>
  )
}
