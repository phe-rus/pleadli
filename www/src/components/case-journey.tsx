import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { PaperSpecimen, type SpecimenKind } from '@/components/paper-specimen'
import { Reveal } from '@/components/reveal'
import { LinkArrow } from '@/components/link-arrow'
import * as m from '@/paraglide/messages'

const wrap = 'container w-full md:max-w-6xl'

const steps = () =>
  [
    { n: 1, slug: 'police', kind: 'police_bond', who: m['journey.s1_who'](), title: m['journey.s1_title'](), body: m['journey.s1_body']() },
    { n: 2, slug: 'dpp', kind: 'charge_sheet', who: m['journey.s2_who'](), title: m['journey.s2_title'](), body: m['journey.s2_body']() },
    { n: 3, slug: 'courts', kind: 'summons', who: m['journey.s3_who'](), title: m['journey.s3_title'](), body: m['journey.s3_body']() },
    { n: 4, slug: 'lawyers', kind: 'letter', who: m['journey.s4_who'](), title: m['journey.s4_title'](), body: m['journey.s4_body']() },
    { n: 5, slug: 'prisons', kind: 'release_warrant', who: m['journey.s5_who'](), title: m['journey.s5_title'](), body: m['journey.s5_body']() },
  ] as const satisfies readonly { n: number; slug: string; kind: SpecimenKind; who: string; title: string; body: string }[]

/** One fictional case through the five offices, each step with the paper that office prints. */
export function CaseJourney() {
  return (
    <section className="border-t border-border/60" aria-labelledby="journey-title">
      <div className={cn(wrap, 'flex flex-col gap-14 py-16 md:gap-20 md:py-28')}>
        <Reveal className="flex max-w-3xl flex-col items-start gap-4">
          <p className="m-0 text-sm font-semibold text-primary-ink">{m['journey.eyebrow']()}</p>
          <h2 id="journey-title" className="text-3xl! font-bold leading-tight! tracking-tight md:text-5xl!">{m['journey.title']()}</h2>
          <p className="text-lg! leading-relaxed text-muted-foreground">{m['journey.lead']()}</p>
        </Reveal>

        <ol className="m-0 flex list-none flex-col gap-16 p-0 md:gap-24">
          {steps().map((step, index) => (
            <li key={step.n}>
              <Reveal className={cn('grid items-center gap-8 md:grid-cols-2 md:gap-16', index % 2 === 1 && 'md:[&>:first-child]:order-2')}>
                <div className="mx-auto w-full max-w-sm md:max-w-md">
                  <PaperSpecimen kind={step.kind} specimen={m['journey.specimen']()} />
                </div>
                <div className="flex flex-col items-start gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{step.n}</span>
                  <p className="m-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{step.who}</p>
                  <h3 className="text-2xl! font-bold leading-tight! tracking-tight md:text-3xl!">{step.title}</h3>
                  <p className="max-w-md text-base! leading-relaxed text-muted-foreground">{step.body}</p>
                  <Link to="/products/$slug" params={{ slug: step.slug }} className="text-base font-medium text-primary-ink hover:underline">
                    {m['home.learn_more']()} <LinkArrow />
                  </Link>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>

        <Reveal className="flex max-w-3xl flex-col items-start gap-3 border-t border-border/60 pt-8">
          <Link to="/verify" className="text-base font-medium text-primary-ink hover:underline">
            {m['journey.verify']()} <LinkArrow />
          </Link>
          <p className="m-0 text-sm leading-relaxed text-muted-foreground">{m['journey.honest']()}</p>
        </Reveal>
      </div>
    </section>
  )
}
