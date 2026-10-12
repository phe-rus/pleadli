import { seo } from '@/lib/seo'
import { CONTACT } from '@/data/contact'
import * as m from '@/paraglide/messages'
import { Building03Icon, CallIcon, HelpCircleIcon, Mail01Icon, Money03Icon, UserIcon, JusticeScale01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Card } from '@pleadli/ui/card'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/contact')({
  head: () => seo({ title: m["contact.meta_title"](), description: m["contact.meta_description"](), path: '/contact' }),
  component: RouteComponent,
})

const reasons = [
  { icon: Building03Icon, title: () => m["contact.who.gov_title"](), text: () => m["contact.who.gov"]() },
  { icon: JusticeScale01Icon, title: () => m["contact.who.inst_title"](), text: () => m["contact.who.inst"]() },
  { icon: Money03Icon, title: () => m["contact.who.partners_title"](), text: () => m["contact.who.partners"]() },
  { icon: HelpCircleIcon, title: () => m["contact.who.help_title"](), text: () => m["contact.who.help"]() },
]

function RouteComponent() {
  return (
    <article className="container flex w-full flex-col md:max-w-6xl">
      <section className="editorial-hero">
        <span className="editorial-eyebrow">{m["nav.contact"]()}</span>
        <h1 className="text-4xl! font-semibold tracking-tight md:text-6xl!">{m["contact.title"]()}</h1>
        <p className="md:max-w-xl md:text-lg!">{m["contact.lead"]()}</p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="gap-4 rounded-3xl border-border/50 bg-muted/30 p-8">
          <HugeiconsIcon icon={Mail01Icon} className="size-10! rounded-xl bg-primary/10 p-2 text-primary" />
          <span className="text-sm text-muted-foreground">{m["contact.email"]()}</span>
          <a href={`mailto:${CONTACT.email}`} className="text-lg font-semibold break-all hover:text-primary">{CONTACT.email}</a>
          <Button className="mt-2 w-fit rounded-full" nativeButton={false} render={<a href={`mailto:${CONTACT.email}`} />}>
            {m["contact.write"]()}
          </Button>
        </Card>
        <Card className="gap-4 rounded-3xl border-border/50 bg-muted/30 p-8">
          <HugeiconsIcon icon={CallIcon} className="size-10! rounded-xl bg-primary/10 p-2 text-primary" />
          <span className="text-sm text-muted-foreground">{m["contact.phone"]()}</span>
          <a href={`tel:${CONTACT.phoneE164}`} className="text-lg font-semibold hover:text-primary">{CONTACT.phone}</a>
          <Button className="mt-2 w-fit rounded-full" variant="secondary" nativeButton={false} render={<a href={`tel:${CONTACT.phoneE164}`} />}>
            {m["contact.call"]()}
          </Button>
        </Card>
        <Card className="gap-4 rounded-3xl border-border/50 bg-muted/30 p-8">
          <HugeiconsIcon icon={UserIcon} className="size-10! rounded-xl bg-primary/10 p-2 text-primary" />
          <span className="text-sm text-muted-foreground">{m["contact.person"]()}</span>
          <span className="text-lg font-semibold">{CONTACT.person}</span>
          <span className="text-sm text-muted-foreground">{m["contact.founder"]()}, Pleadli</span>
        </Card>
      </section>

      <section className="flex flex-col gap-8 py-20">
        <h2 className="text-2xl! md:text-3xl! tracking-tight">{m["contact.who_title"]()}</h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {reasons.map((reason) => (
            <div key={reason.title()} className="flex gap-4">
              <HugeiconsIcon icon={reason.icon} className="mt-1 shrink-0 text-primary" />
              <div className="flex flex-col gap-1">
                <h3 className="text-base! font-semibold">{reason.title()}</h3>
                <p>{reason.text()}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </article>
  )
}
