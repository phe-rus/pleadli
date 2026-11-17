import { CONTACT } from '@/data/contact'
import { seo } from '@/lib/seo'
import { getProducts } from '@/data/products'
import { HugeiconsIcon } from '@hugeicons/react'
import { InformationCircleIcon } from '@hugeicons/core-free-icons'
import * as m from '@/paraglide/messages'
import { createFileRoute, Link } from '@tanstack/react-router'
import { getReleases } from '@/functions/releases.func'
import { DownloadActions } from '@/components/download-actions'
import { FaqList } from '@/components/faq-list'
import { Reveal } from '@/components/reveal'
import { cn } from '@pleadli/ui/lib/utils'
import { LinkArrow } from '@/components/link-arrow'

export const Route = createFileRoute('/_public/downloads')({
  head: () => seo({ title: m['seo.downloads_title'](), description: m['downloads.lead'](), path: '/downloads' }),
  loader: () => getReleases(),
  component: RouteComponent,
})

function RouteComponent() {
  const live = Route.useLoaderData()
  const products = getProducts()
  const standing = [m['downloads.stand.installers'](), m['downloads.stand.updates'](), m['downloads.stand.codesign'](), m['downloads.stand.rest']()]

  return (
    <article className="container flex w-full flex-col gap-10 pb-20 md:max-w-6xl">
      <Reveal immediate className="flex max-w-3xl flex-col items-start gap-4 pt-14 md:pt-20">
        <h1 className="text-4xl! font-semibold tracking-[-0.04em] md:text-6xl!">{m['downloads.title']()}</h1>
        <p className="text-base! leading-relaxed text-muted-foreground md:text-lg!">{m['downloads.lead']()}</p>
        <p className={cn(
          'flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/50',
          'px-4 py-3 text-sm text-muted-foreground',
        )}>
          <HugeiconsIcon icon={InformationCircleIcon} className="mt-0.5 size-4! shrink-0 text-primary-ink" />
          {m['downloads.early_note']()}
        </p>
      </Reveal>

      <section aria-label={m['nav.products']()} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products.map((product, index) => (
          <Reveal key={product.slug} delay={Math.min(index, 2) * 0.06} className="h-full">
            <div id={product.slug} className={cn(
              'flex h-full scroll-mt-24 flex-col gap-5 rounded-2xl border border-border/60',
              'bg-card p-6 shadow-xs',
            )}>
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl border border-border/60 bg-muted text-primary-ink"><HugeiconsIcon icon={product.icon} className="size-5!" /></span>
                <h2 className="text-lg! font-semibold tracking-tight">{product.name}</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{product.tagline}</p>
              <div className="mt-auto flex flex-col gap-4">
                <DownloadActions name={product.name} availability={live[product.slug] ?? { status: 'unavailable' }} align="start" />
                <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4 text-sm">
                  <Link to="/products/$slug" params={{ slug: product.slug }} className="font-medium text-primary-ink hover:underline">
                    {m['home.learn_more']()} <LinkArrow />
                  </Link>
                  <a
                    href={`mailto:${CONTACT.email}?subject=${encodeURIComponent(product.name + ' enquiry')}`}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {m['nav.contact']()} <LinkArrow external />
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        ))}
      </section>

      <FaqList
        items={[
          {
            id: 'before',
            title: m['downloads.stand_title'](),
            body: <ul className="m-0 flex max-w-2xl list-none flex-col gap-2.5 p-0">{standing.map((item) => <li key={item}>{item}</li>)}</ul>,
          },
          { id: 'start', title: m['docs.start.title'](), body: <Link to="/docs/getting-started" className="font-medium text-primary-ink hover:underline">{m['docs.start.title']()} <LinkArrow /></Link> },
          { id: 'help', title: m['downloads.install_help'](), body: <Link to="/contact" className="font-medium text-primary-ink hover:underline">{m['nav.contact']()} <LinkArrow /></Link> },
        ]}
      />
    </article>
  )
}
