import { useState } from 'react'
import { seo } from '@/lib/seo'
import { Button } from '@pleadli/ui/button'
import { getProducts } from '@/data/products'
import { productPresentation } from '@/data/product-presentation'
import { ProductPreview } from '@/components/product-preview'
import { ArrowRight02Icon, FileValidationIcon, LanguageSkillIcon, WifiDisconnected01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import * as m from '@/paraglide/messages'

export const Route = createFileRoute('/_public/')({
  head: () => seo({ title: m['seo.home_title'](), description: m['site.description'](), path: '/' }),
  component: RouteComponent,
})

function RouteComponent() {
  const products = getProducts()
  const [featuredSlug, setFeaturedSlug] = useState('courts')
  const featured = products.find(product => product.slug === featuredSlug)!
  const story = productPresentation(featured.slug)
  return <article className="container w-full md:max-w-6xl">
    <section className="flex flex-col items-center gap-5 pb-10 pt-12 text-center md:pt-16">
      <span className="text-sm font-medium tracking-wide text-primary">{m['launch.eyebrow']()}</span>
      <h1 className="max-w-4xl text-5xl! font-semibold leading-[1.05]! tracking-[-0.045em] md:text-6xl!">{m['polish.intro_title']()}</h1>
      <p className="text-2xl! font-medium tracking-tight md:text-3xl!">{m['polish.slogan']()}</p>
      <p className="max-w-2xl text-base! leading-relaxed text-muted-foreground">{m['polish.intro_lead']()}</p>
      <div className="flex flex-wrap justify-center gap-3 pt-1">
        <Button size="lg" className="rounded-full px-6" nativeButton={false} render={<Link to="/downloads" />}>{m['launch.choose']()}<HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" /></Button>
        <Button size="lg" variant="ghost" className="rounded-full" nativeButton={false} render={<Link to="/contact" />}>{m['launch.talk']()}</Button>
      </div>
    </section>

    <section className={`product-showcase product-tone-${featured.slug} overflow-hidden rounded-[2rem] px-4 pb-8 pt-6 sm:px-10 sm:pb-10`} aria-label={m['preview.explore']()}>
      <div className="mb-8 flex flex-wrap justify-center gap-2" role="group" aria-label={m['launch.see']()}>
        {['courts', 'prisons'].map(slug => <button key={slug} type="button" aria-pressed={featuredSlug === slug} onClick={() => setFeaturedSlug(slug)} className="preview-selector rounded-full px-5 py-2.5 text-sm">{products.find(product => product.slug === slug)!.name}</button>)}
      </div>
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <h2 className="max-w-2xl text-2xl! font-semibold tracking-tight md:text-3xl!">{story.title}</h2>
        <Link to="/products/$slug" params={{ slug: featured.slug }} className="text-sm font-medium text-primary">{m['home.learn_more']()} <span aria-hidden="true">↗</span></Link>
      </div>
      <ProductPreview key={featured.slug} product={featured} />
    </section>

    <section className="py-20 md:py-28">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h2 className="text-3xl! font-semibold tracking-tight md:text-5xl!">{m['launch.family']()}</h2>
        <p className="mt-5 text-base! text-muted-foreground">{m['launch.family_lead']()}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {products.map((product, index) => {
          const intro = productPresentation(product.slug)
          return <Link key={product.slug} to="/products/$slug" params={{ slug: product.slug }} className={`product-showcase product-tone-${product.slug} group flex flex-col items-start gap-5 rounded-[2rem] p-8 transition-transform duration-300 motion-safe:hover:-translate-y-1 sm:p-10 ${index === products.length - 1 ? 'md:col-span-2 md:items-center md:text-center' : ''}`}>
            <span className="product-app-icon"><HugeiconsIcon icon={product.icon} className="size-7!" /></span>
            <span className="text-sm font-semibold">{product.name}</span>
            <h3 className="max-w-lg text-2xl! font-semibold leading-tight! tracking-tight sm:text-3xl!">{intro.title}</h3>
            <p className="max-w-lg text-base! leading-relaxed text-muted-foreground">{intro.lead}</p>
            <span className="mt-auto inline-flex items-center gap-2 pt-3 text-sm font-medium text-primary">{m['home.learn_more']()}<HugeiconsIcon icon={ArrowRight02Icon} className="size-4! transition-transform duration-200 group-hover:translate-x-1" /></span>
          </Link>
        })}
      </div>
    </section>

    <section className="border-y border-border/50 py-16">
      <h2 className="mx-auto mb-10 max-w-xl text-center text-3xl! font-semibold tracking-tight">{m['launch.everyday']()}</h2>
      <div className="grid gap-10 md:grid-cols-3">
        {[
          { icon: WifiDisconnected01Icon, title: m['launch.offline_title'](), text: m['launch.offline']() },
          { icon: FileValidationIcon, title: m['launch.documents_title'](), text: m['launch.documents']() },
          { icon: LanguageSkillIcon, title: m['launch.languages_title'](), text: m['launch.languages']() },
        ].map(item => <div key={item.title} className="flex flex-col gap-3"><HugeiconsIcon icon={item.icon} className="size-7! text-primary" /><h3 className="text-lg! font-semibold">{item.title}</h3><p className="text-base! leading-relaxed text-muted-foreground">{item.text}</p></div>)}
      </div>
    </section>

    <section className="flex flex-col items-center gap-5 py-20 text-center md:py-28">
      <h2 className="max-w-2xl text-3xl! font-semibold tracking-tight md:text-5xl!">{m['launch.close']()}</h2>
      <p className="max-w-lg text-base! text-muted-foreground">{m['launch.close_lead']()}</p>
      <Button size="lg" className="mt-2 rounded-full px-6" nativeButton={false} render={<Link to="/downloads" />}>{m['launch.choose']()}<HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" /></Button>
    </section>
  </article>
}
