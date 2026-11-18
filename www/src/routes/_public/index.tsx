import { seo } from '@/lib/seo'
import { Button } from '@pleadli/ui/button'
import { getProducts } from '@/data/products'
import { productPresentation } from '@/data/product-presentation'
import { FeatureShowcase } from "@/components/feature-showcase"
import { ProductWindow } from "@/components/replica/product-window"
import { PinnedStory } from "@/components/pinned-story"
import { Reveal } from '@/components/reveal'
import { Download01Icon, FileValidationIcon, LanguageSkillIcon, WifiDisconnected01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import * as m from '@/paraglide/messages'
import { cn } from '@pleadli/ui/lib/utils'
import { LinkArrow } from '@/components/link-arrow'
import { CaseJourney } from '@/components/case-journey'
import { TwoWays } from '@/components/two-ways'

export const Route = createFileRoute('/_public/')({
  head: () => seo({ title: m['seo.home_title'](), description: m['site.description'](), path: '/' }),
  component: RouteComponent,
})

const wrap = 'container w-full md:max-w-6xl'
const horizon = () => [
  { label: m['roadmap.h_now'](), dot: 'bg-primary', items: [m['roadmap.now.1'](), m['roadmap.now.2'](), m['roadmap.now.3'](), m['roadmap.now.4']()] },
  { label: m['roadmap.h_next'](), dot: 'bg-primary/40', items: [m['roadmap.next.1'](), m['roadmap.next.2'](), m['roadmap.next.3'](), m['roadmap.next.4']()] },
  { label: m['roadmap.h_later'](), dot: 'bg-border', items: [m['roadmap.later.1'](), m['roadmap.later.2']()] },
]

function RouteComponent() {
  const products = getProducts()
  const assurances = [
    { icon: WifiDisconnected01Icon, title: m["launch.offline_title"](), text: m["launch.offline"]() },
    { icon: FileValidationIcon, title: m["launch.documents_title"](), text: m["launch.documents"]() },
    { icon: LanguageSkillIcon, title: m["launch.languages_title"](), text: m["launch.languages"]() },
  ]
  const bySlug = (slug: string) => products.find((product) => product.slug === slug) ?? products[0]
  const courts = bySlug("courts")
  const prisons = bySlug("prisons")
  const police = bySlug("police")

  return (
    <article>
      <div className="bg-muted/60">
        <PinnedStory />
      </div>

      <CaseJourney />

      <TwoWays />

      <section className="border-t border-border/60" aria-label={m["launch.everyday"]()}>
        <div className={cn(wrap, "py-16 md:py-24")}>
          <Reveal className="mb-10 flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <h2 className="text-3xl! font-bold tracking-tight md:text-4xl!">{m["launch.everyday"]()}</h2>
            <Link to="/downloads" className="text-base font-medium text-primary-ink hover:underline">
              {m["launch.choose"]()} <LinkArrow />
            </Link>
          </Reveal>
          <div className="grid gap-10 md:grid-cols-3 md:gap-12">
            {assurances.map((item, index) => (
              <Reveal key={item.title} delay={index * 0.06} className="flex flex-col gap-3">
                <HugeiconsIcon icon={item.icon} className="size-7! text-primary-ink" />
                <h3 className="text-xl! font-semibold">{item.title}</h3>
                <p className="text-base! leading-relaxed text-muted-foreground">{item.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 bg-muted/60" aria-labelledby="features-title">
        <div className={cn(wrap, "flex flex-col gap-8 py-16 md:py-24")}>
          <Reveal>
            <h2 id="features-title" className="text-3xl! font-bold tracking-tight md:text-4xl!">{m["preview.details"]()}</h2>
          </Reveal>
          <FeatureShowcase />
        </div>
      </section>

      <section aria-label={m["launch.see"]()}>
        <div className={cn(wrap, "flex flex-col gap-16 py-16 md:gap-24 md:py-28")}>
          <Reveal className="flex flex-col gap-8">
            <div className="flex max-w-2xl flex-col items-start gap-4">
              <h2 className="text-3xl! font-bold leading-tight! tracking-tight md:text-4xl!">{productPresentation(courts.slug).title}</h2>
              <p className="text-lg! leading-relaxed text-muted-foreground">{productPresentation(courts.slug).lead}</p>
              <Link to="/products/$slug" params={{ slug: courts.slug }} className="text-base font-medium text-primary-ink hover:underline">
                {m["home.learn_more"]()} <LinkArrow />
              </Link>
            </div>
            <ProductWindow slug={courts.slug} name={courts.name} />
          </Reveal>

          <div className="grid gap-12 md:grid-cols-2 md:gap-10">
            {[prisons, police].map((product, index) => (
              <Reveal key={product.slug} delay={index * 0.08} className="flex flex-col gap-6">
                <ProductWindow slug={product.slug} name={product.name} />
                <div className="flex flex-col items-start gap-3">
                  <h3 className="text-2xl! font-bold leading-tight! tracking-tight">{productPresentation(product.slug).title}</h3>
                  <p className="text-base! leading-relaxed text-muted-foreground">{productPresentation(product.slug).lead}</p>
                  <Link to="/products/$slug" params={{ slug: product.slug }} className="text-base font-medium text-primary-ink hover:underline">
                    {m["home.learn_more"]()} <LinkArrow />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 bg-muted/60" aria-labelledby="open-title">
        <div className={cn(wrap, "grid gap-12 py-16 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16 md:py-28")}>
          <Reveal className="flex flex-col items-start gap-4">
            <h2 id="open-title" className="text-3xl! font-bold leading-tight! tracking-tight md:text-4xl!">{m["home.open_title"]()}</h2>
            <p className="text-lg! leading-relaxed text-muted-foreground">{m["home.open_lead"]()}</p>
            <Link to="/roadmap" className="text-base font-medium text-primary-ink hover:underline">
              {m["nav.roadmap"]()} <LinkArrow />
            </Link>
          </Reveal>
          <Reveal delay={0.1}>
            <ol className="m-0 flex list-none flex-col gap-8 border-l border-border pl-8">
              {horizon().map((group) => (
                <li key={group.label} className="relative flex flex-col gap-2">
                  <span className={cn("absolute -left-[2.4rem] top-1 size-3 rounded-full ring-4 ring-muted", group.dot)} aria-hidden="true" />
                  <h3 className="text-sm! font-semibold">{group.label}</h3>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm text-muted-foreground">
                    {group.items.map((entry) => <li key={entry}>{entry}</li>)}
                  </ul>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border/60">
        <Reveal className={cn(wrap, "flex flex-col items-start gap-5 py-20 md:py-28")}>
          <h2 className="max-w-2xl text-3xl! font-bold tracking-tight md:text-5xl!">{m["launch.close"]()}</h2>
          <p className="max-w-lg text-lg! text-muted-foreground">{m["launch.close_lead"]()}</p>
          <Button size="lg" className="mt-2 rounded-md px-5" nativeButton={false} render={<Link to="/downloads" />}>
            <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
            {m["launch.choose"]()}
          </Button>
        </Reveal>
      </section>
    </article>
  )
}
