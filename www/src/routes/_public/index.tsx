import { seo } from '@/lib/seo'
import { Button } from '@pleadli/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { getProducts, getReadinessLabel } from '@/data/products'
import {
  ArrowRight02Icon,
  Briefcase01Icon,
  CourtHouseIcon,
  Download01Icon,
  FileValidationIcon,
  GavelIcon,
  LanguageSkillIcon,
  LockKeyIcon,
  PoliceBadgeIcon,
  PrisonIcon,
  Route02Icon,
  ShieldUserIcon,
  UserEditIcon,
  WifiDisconnected01Icon,
  Building03Icon,
  Analytics01Icon,
  Location01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import * as m from '@/paraglide/messages'

export const Route = createFileRoute('/_public/')({
  head: () => seo({ title: m["site.title"](), description: m["site.description"](), path: '/' }),
  component: RouteComponent,
})

/** A section's heading and its one-paragraph lead, the same everywhere. */
function SectionHead({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="flex flex-col gap-2 md:max-w-xl">
      <h2 className="text-2xl! md:text-3xl! tracking-tight">{title}</h2>
      <p className="md:text-base!">{lead}</p>
    </div>
  )
}

const appLines = {
  police: () => m["home.app.police"](),
  dpp: () => m["home.app.dpp"](),
  courts: () => m["home.app.courts"](),
  lawyers: () => m["home.app.lawyers"](),
  prisons: () => m["home.app.prisons"](),
} as Record<string, () => string>

/** The journey of one case, in the order the institutions meet it. */
const steps = [
  { icon: PoliceBadgeIcon, title: () => m["home.step.police_title"](), text: () => m["home.step.police"]() },
  { icon: Briefcase01Icon, title: () => m["home.step.dpp_title"](), text: () => m["home.step.dpp"]() },
  { icon: FileValidationIcon, title: () => m["home.step.decide_title"](), text: () => m["home.step.decide"]() },
  { icon: CourtHouseIcon, title: () => m["home.step.court_title"](), text: () => m["home.step.court"]() },
  { icon: GavelIcon, title: () => m["home.step.lawyers_title"](), text: () => m["home.step.lawyers"]() },
  { icon: PrisonIcon, title: () => m["home.step.prisons_title"](), text: () => m["home.step.prisons"]() },
]

const madeFor = [
  { icon: WifiDisconnected01Icon, title: () => m["home.made.offline_title"](), text: () => m["home.made.offline"]() },
  { icon: LanguageSkillIcon, title: () => m["home.made.languages_title"](), text: () => m["home.made.languages"]() },
  { icon: FileValidationIcon, title: () => m["home.made.paper_title"](), text: () => m["home.made.paper"]() },
  { icon: Building03Icon, title: () => m["home.made.own_title"](), text: () => m["home.made.own"]() },
]

const partners = [
  { icon: Location01Icon, title: () => m["home.partners.pilot_title"](), text: () => m["home.partners.pilot"]() },
  { icon: Analytics01Icon, title: () => m["home.partners.oversight_title"](), text: () => m["home.partners.oversight"]() },
  { icon: ShieldUserIcon, title: () => m["home.partners.sovereign_title"](), text: () => m["home.partners.sovereign"]() },
]

const trust = [
  { icon: LockKeyIcon, title: () => m["home.trust.locked_title"](), text: () => m["home.trust.locked"]() },
  { icon: UserEditIcon, title: () => m["home.trust.named_title"](), text: () => m["home.trust.named"]() },
  { icon: ShieldUserIcon, title: () => m["home.trust.law_title"](), text: () => m["home.trust.law"]() },
]

function RouteComponent() {
  const readiness = getReadinessLabel()

  return (
    <article className="container flex w-full flex-col md:max-w-5xl">
      <section className="flex min-h-[78vh] flex-col justify-center gap-6 py-16">
        <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{m["home.hero_badge"]()}</span>
        <h1 className="text-3xl leading-[1.08] tracking-tight md:max-w-3xl md:text-6xl!">
          {m["home.hero_title_1"]()}{' '}
          <span className="text-primary">{m["home.hero_title_2"]()}</span>
        </h1>
        <p className="md:max-w-xl md:text-lg!">{m["home.hero_lead"]()}</p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button size="lg" nativeButton={false} render={<Link to="/downloads" />}>
            <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
            {m["home.download"]()}
          </Button>
          <Button size="lg" variant="secondary" nativeButton={false} render={<a href="#case" />}>
            {m["home.see_case"]()}
            <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-8 border-t border-border/60 py-20">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          {[
            { value: '48%', text: m["home.stat_remand"]() },
            { value: '48 hrs', text: m["home.stat_hours"]() },
            { value: '34.5%', text: m["home.stat_complaints"]() },
          ].map((stat) => (
            <div key={stat.value} className="flex flex-col gap-2">
              <span className="text-5xl font-semibold tracking-tight text-primary md:text-6xl!">{stat.value}</span>
              <p>{stat.text}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{m["home.stat_source"]()}</p>
      </section>

      <section className="flex flex-col gap-10 py-20">
        <SectionHead title={m["home.apps_title"]()} lead={m["home.apps_lead"]()} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {getProducts().map((product) => (
            <Link key={product.slug} to="/products/$slug" params={{ slug: product.slug }} className="group">
              <Card className="h-full gap-4 p-6 transition group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
                <HugeiconsIcon icon={product.icon} className="size-7! text-primary" />
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-lg!">{product.name}</CardTitle>
                  <span className="text-sm text-muted-foreground">{product.homeFocus}</span>
                </div>
                <p className="text-base!">{appLines[product.slug]?.() ?? product.homeFocus}</p>
                <div className="mt-auto flex items-center justify-between pt-2 text-sm">
                  <span className="text-muted-foreground">{readiness[product.readiness]}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    {m["home.learn_more"]()}
                    <HugeiconsIcon icon={ArrowRight02Icon} className="size-3.5! transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section id="case" className="flex scroll-mt-20 flex-col gap-10 py-20">
        <SectionHead title={m["home.case_title"]()} lead={m["home.case_lead"]()} />
        <ol className="relative grid grid-cols-1 gap-x-10 gap-y-8 pl-0 md:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, index) => (
            <li key={index} className="flex gap-4 pl-0">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <HugeiconsIcon icon={step.icon} className="size-5!" />
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{index + 1}</span>
                <h3 className="text-base! font-semibold">{step.title()}</h3>
                <p>{step.text()}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-10 py-20">
        <SectionHead title={m["home.made_title"]()} lead={m["home.made_lead"]()} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {madeFor.map((item) => (
            <Card key={item.title()}>
              <CardHeader className="gap-2">
                <HugeiconsIcon icon={item.icon} className="text-primary" />
                <CardTitle>{item.title()}</CardTitle>
                <CardDescription className="text-base!">{item.text()}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="py-20">
        <div className="flex flex-col gap-10 rounded-3xl bg-primary/[0.07] p-6 ring-1 ring-primary/15 sm:p-10">
          <SectionHead title={m["home.partners_title"]()} lead={m["home.partners_lead"]()} />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {partners.map((item) => (
              <div key={item.title()} className="flex flex-col gap-2">
                <HugeiconsIcon icon={item.icon} className="text-primary" />
                <h3 className="text-base! font-semibold">{item.title()}</h3>
                <p>{item.text()}</p>
              </div>
            ))}
          </div>
          <Button size="lg" className="w-fit" nativeButton={false} render={<Link to="/create-account" />}>
            {m["home.partners_cta"]()}
            <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" />
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-10 py-20">
        <SectionHead title={m["home.trust_title"]()} lead={m["home.trust_lead"]()} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {trust.map((item) => (
            <Card key={item.title()}>
              <CardHeader className="gap-2">
                <HugeiconsIcon icon={item.icon} className="text-primary" />
                <CardTitle>{item.title()}</CardTitle>
                <CardDescription className="text-base!">{item.text()}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6 border-t border-border/60 py-20 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl! md:text-3xl! tracking-tight">{m["home.end_title"]()}</h2>
          <p className="md:max-w-md">{m["home.end_lead"]()}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Button size="lg" nativeButton={false} render={<Link to="/downloads" />}>
            <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
            {m["nav.downloads"]()}
          </Button>
          <Button size="lg" variant="secondary" nativeButton={false} render={<Link to="/roadmap" />}>
            <HugeiconsIcon icon={Route02Icon} data-icon="inline-start" />
            {m["nav.roadmap"]()}
          </Button>
        </div>
      </section>
    </article>
  )
}
