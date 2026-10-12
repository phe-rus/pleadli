import { productPresentation } from '@/data/product-presentation'
import { seo } from '@/lib/seo'
import { ProductPreview } from '@/components/product-preview'
import { getProducts } from '@/data/products'
import { ArrowRight02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import * as m from '@/paraglide/messages'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/products/')({
  head: () => seo({ title: m['seo.products_title'](), description: m["products.lead"](), path: '/products' }),
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex w-full flex-col gap-5 md:max-w-5xl">
      <section className="editorial-hero">
        <span className="editorial-eyebrow">{m["nav.products"]()}</span>
        <h1 className="text-3xl! tracking-tight md:max-w-3xl md:text-6xl!">
          {m["products.title"]()}
        </h1>
        <p className="md:max-w-lg md:text-base!">
          {m["products.lead"]()}
        </p>
      </section>

      <section className="flex flex-col gap-10">
        {getProducts().map((product) => (
          <div key={product.slug} className={`product-showcase product-tone-${product.slug} overflow-hidden rounded-[2rem] p-6 sm:p-10`}>
            <div className="mb-8">
              <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 text-center">
                <div className="flex items-center justify-between">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <HugeiconsIcon icon={product.icon} />
                  </div>
                </div>
                <div>
                  <h2 className="text-sm! font-semibold">{product.name}</h2>
                  <p className="mt-4 text-2xl! font-semibold leading-tight! tracking-tight">{productPresentation(product.slug).title}</p>
                  <p className="mt-4 text-base! leading-relaxed text-muted-foreground">{productPresentation(product.slug).lead}</p>
                </div>
                <Link to="/products/$slug" params={{ slug: product.slug }} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {m["home.learn_more"]()}
                  <HugeiconsIcon icon={ArrowRight02Icon} className="size-3.5!" />
                </Link>
              </div>
            </div>
            <ProductPreview product={product} />
          </div>
        ))}
      </section>

      <section className="flex flex-col items-center gap-5 py-20 text-center">
        <h2 className="max-w-2xl text-3xl! font-semibold tracking-tight">{m['launch.close']()}</h2>
        <p className="max-w-lg text-base! text-muted-foreground">{m['launch.close_lead']()}</p>
        <Link to="/downloads" className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground">{m['launch.choose']()} <span aria-hidden="true">→</span></Link>
      </section>
    </article>
  )
}
