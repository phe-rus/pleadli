import { seo } from '@/lib/seo'
import { CONTACT } from '@/data/contact'
import * as m from '@/paraglide/messages'
import { ArrowRight02Icon, Building03Icon, Download01Icon, JusticeScale01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Card } from '@pleadli/ui/card'
import { createFileRoute, Link } from '@tanstack/react-router'
import { cn } from '@pleadli/ui/lib/utils'
import { FaqList } from '@/components/faq-list'

export const Route = createFileRoute('/_public/licensing')({
  head: () => seo({ title: m['seo.licensing_title'](), description: m["pricing.meta_description"](), path: '/licensing' }),
  component: RouteComponent,
})

const faq = [
  { q: () => m["pricing.faq.after_q"](), a: () => m["pricing.faq.after_a"]() },
  { q: () => m["pricing.faq.locked_q"](), a: () => m["pricing.faq.locked_a"]() },
  { q: () => m["pricing.faq.read_q"](), a: () => m["pricing.faq.read_a"]() },
  { q: () => m["pricing.faq.where_q"](), a: () => m["pricing.faq.where_a"]() },
  { q: () => m["pricing.faq.reinstall_q"](), a: () => m["pricing.faq.reinstall_a"]() },
]

/** How Pleadli is licensed: public institutions by agreement through their
 * headquarters, advocates and firms online, every office on a trial first.
 * Records are never locked; this page says so before anything else. */
function RouteComponent() {
  return (
    <article className="container flex w-full flex-col md:max-w-6xl">
      <section className="editorial-hero">
        <h1 className="text-4xl! font-semibold tracking-tight md:max-w-3xl md:text-6xl!">{m["pricing.title"]()}</h1>
        <p className="md:max-w-xl md:text-lg!">{m["pricing.lead"]()}</p>
        <p className={cn(
          'w-fit rounded-xl bg-primary/[0.07] px-4 py-3 text-sm',
          'ring-1 ring-primary/15',
        )}>{m["pricing.now_note"]()}</p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="gap-5 rounded-2xl border-border/60 bg-card p-8 shadow-xs sm:p-10">
          <HugeiconsIcon icon={Building03Icon} className="size-7! text-primary-ink" />
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl! font-bold tracking-tight">{m["pricing.public_title"]()}</h2>
            <span className="text-sm text-muted-foreground">{m["pricing.public_who"]()}</span>
          </div>
          <p className="text-base! leading-relaxed text-muted-foreground">{m["pricing.public_body"]()}</p>
          <Button className="mt-auto w-fit rounded-md" nativeButton={false} render={<Link to="/contact" />}>
            {m["pricing.public_cta"]()}
            <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
          </Button>
        </Card>
        <Card className="gap-5 rounded-2xl border-border/60 bg-card p-8 shadow-xs sm:p-10">
          <HugeiconsIcon icon={JusticeScale01Icon} className="size-7! text-primary-ink" />
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl! font-bold tracking-tight">{m["pricing.practice_title"]()}</h2>
            <span className="text-sm text-muted-foreground">{m["pricing.practice_who"]()}</span>
          </div>
          <p className="text-base! leading-relaxed text-muted-foreground">{m["pricing.practice_body"]()}</p>
          <Button className="mt-auto w-fit rounded-full" variant="secondary" nativeButton={false} render={<a href={`mailto:${CONTACT.email}?subject=${encodeURIComponent(m["pricing.practice_cta"]())}`} />}>
            {m["pricing.practice_cta"]()}
          </Button>
        </Card>
      </section>

      <section className="flex flex-col gap-6 py-20">
        <h2 className="text-3xl! font-bold tracking-tight md:text-4xl!">{m["pricing.every_title"]()}</h2>
        <ul className="grid grid-cols-1 gap-6 pl-0 md:grid-cols-3">
          {[m["pricing.every.trial"](), m["pricing.every.after"](), m["pricing.every.licence"]()].map((text, i) => (
            <li key={i} className="flex flex-col gap-2 pl-0">
              <span className={cn(
                'flex size-9 items-center justify-center rounded-full border border-border/60 bg-muted',
                'text-sm font-semibold text-primary-ink',
              )}>{i + 1}</span>
              <p className="text-base! leading-relaxed text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
        <Button size="lg" className="w-fit" nativeButton={false} render={<Link to="/downloads" />}>
          <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
          {m["pricing.download"]()}
        </Button>
        <p className="text-base! text-muted-foreground md:max-w-xl">{m["pricing.payments_note"]()}</p>
      </section>

      <section className="flex flex-col gap-6 border-t border-border/60 py-20">
        <h2 className="text-3xl! font-bold tracking-tight md:text-4xl!">{m["pricing.faq_title"]()}</h2>
        <FaqList items={faq.map((item) => ({ id: item.q(), title: item.q(), body: item.a() }))} />
      </section>
    </article>
  )
}
