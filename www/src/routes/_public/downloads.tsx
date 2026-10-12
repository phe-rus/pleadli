import { CONTACT } from '@/data/contact'
import { seo } from '@/lib/seo'
import { Badge } from '@pleadli/ui/badge'
import { Card } from '@pleadli/ui/card'
import { getProducts } from '@/data/products'
import { HugeiconsIcon } from '@hugeicons/react'
import * as m from '@/paraglide/messages'
import { createFileRoute, Link } from '@tanstack/react-router'
import { getReleases } from '@/functions/releases.func'
import { DownloadActions } from '@/components/download-actions'
import { ProductPreview } from '@/components/product-preview'
import { productPresentation } from '@/data/product-presentation'

export const Route = createFileRoute('/_public/downloads')({
  head: () => seo({ title: `${m['downloads.title']().replace(/\.$/, '')} · Pleadli`, description: m['downloads.lead'](), path: '/downloads' }),
  loader: () => getReleases(),
  component: RouteComponent,
})

function RouteComponent() {
  const live = Route.useLoaderData()
  return (
    <article className="container flex w-full flex-col gap-5 md:max-w-6xl">
      <section className="flex flex-col items-center gap-5 py-16 text-center md:py-24">
        <Badge variant="secondary">{m['nav.downloads']()}</Badge>
        <h1 className="text-4xl! tracking-tight md:max-w-3xl md:text-6xl!">{m['downloads.title']()}</h1>
        <p className="max-w-xl md:text-base!">{m['downloads.lead']()}</p>
        <p className="max-w-xl text-sm text-muted-foreground">{m['downloads.early_note']()}</p>
      </section>

      <nav aria-label={m['nav.products']()} className="flex flex-wrap justify-center gap-2 pb-8">
        {getProducts().map(product => <a key={product.slug} href={`#${product.slug}`} className="rounded-full border border-border/60 bg-muted/40 px-4 py-2 text-sm transition-colors hover:bg-primary/10 hover:text-primary">{product.name}</a>)}
      </nav>
      <section className="flex flex-col gap-10 pb-16" aria-label={m['nav.products']()}>
        {getProducts().map((product) => {
          const story = productPresentation(product.slug)
          return <Card key={product.slug} id={product.slug} className={`product-showcase product-tone-${product.slug} scroll-mt-24 gap-0 overflow-hidden rounded-[2rem] border-0 p-0 shadow-none`}>
            <div className="flex flex-col items-center gap-4 px-6 pt-12 text-center sm:px-12 sm:pt-16">
              <span className="product-app-icon"><HugeiconsIcon icon={product.icon} className="size-7!" /></span>
              <h2 className="text-base! font-semibold tracking-tight">{product.name}</h2>
              <p className="max-w-3xl text-3xl! font-semibold leading-[1.12]! tracking-tight sm:text-5xl!">{story.title}</p>
              <p className="max-w-xl text-base! leading-relaxed text-muted-foreground">{story.lead}</p>
              <Link to="/products/$slug" params={{ slug: product.slug }} className="mt-1 text-sm font-medium text-primary">{m['home.learn_more']()} <span aria-hidden="true">↗</span></Link>
            </div>
            <div className="px-4 pt-10 sm:px-12"><ProductPreview product={product} /></div>
            <div className="flex flex-col items-center gap-5 px-6 py-10 text-center">
              <DownloadActions name={product.name} availability={live[product.slug] ?? { status: 'unavailable' }} />
              <a href={`mailto:${CONTACT.email}?subject=${encodeURIComponent(product.name + ' enquiry')}`} className="text-xs text-muted-foreground hover:text-foreground">{m['product.contact']({ name: product.name })} <span aria-hidden="true">↗</span></a>
            </div>
          </Card>
        })}
      </section>

      <section className="flex flex-col items-start gap-4 border-t border-border/60 py-10">
        <h2 className="text-xl!">{m['downloads.stand_title']()}</h2>
        <ul className="flex max-w-2xl flex-col gap-3 text-sm text-muted-foreground">
          {[m['downloads.stand.installers'](), m['downloads.stand.updates'](), m['downloads.stand.codesign'](), m['downloads.stand.rest']()].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Link to="/docs/getting-started" className="text-sm underline underline-offset-4">{m['docs.start.title']()}</Link>
        <Link to="/contact" className="text-sm underline underline-offset-4">{m['downloads.install_help']()}</Link>
      </section>
    </article>
  )
}
