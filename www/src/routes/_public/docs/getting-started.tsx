import { seo } from '@/lib/seo'
import * as m from '@/paraglide/messages'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/docs/getting-started')({
  head: () => seo({ title: `${m["docs.start.title"]()} · Pleadli`, description: m["docs.start.lead"](), path: '/docs/getting-started' }),
  component: RouteComponent,
})

const today = [
  { title: () => m["docs.start.s1_title"](), text: () => m["docs.start.s1"]() },
  { title: () => m["docs.start.s2_title"](), text: () => m["docs.start.s2"]() },
  { title: () => m["docs.start.s3_title"](), text: () => m["docs.start.s3"]() },
  { title: () => m["docs.start.s4_title"](), text: () => m["docs.start.s4"]() },
]
const coming = [
  { title: () => m["docs.start.s5_title"](), text: () => m["docs.start.s5"]() },
  { title: () => m["docs.start.s6_title"](), text: () => m["docs.start.s6"]() },
  { title: () => m["docs.start.s7_title"](), text: () => m["docs.start.s7"]() },
]

function Steps({ steps, from, muted }: { steps: typeof today; from: number; muted?: boolean }) {
  return (
    <ol className="flex flex-col gap-6 pl-0">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-4 pl-0">
          <span className={muted ? 'flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/40 text-sm font-semibold text-primary' : 'flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary'}>
            {from + i}
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="text-base! font-semibold">{step.title()}</h3>
            <p>{step.text()}</p>
            {from + i === 1 && (
              <Link to="/downloads" className="w-fit text-sm font-medium text-primary">
                {m["nav.downloads"]()} →
              </Link>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** The steps an office takes, in its own order: what works today first, then
 * what Pleadli Orchestra adds, marked as coming. */
function RouteComponent() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl! tracking-tight">{m["docs.start.title"]()}</h1>
        <p>{m["docs.start.lead"]()}</p>
      </div>
      <section className="flex flex-col gap-5">
        <h2 className="text-xl!">{m["docs.start.today"]()}</h2>
        <Steps steps={today} from={1} />
      </section>
      <section className="flex flex-col gap-5">
        <h2 className="text-xl!">{m["docs.start.coming"]()}</h2>
        <Steps steps={coming} from={5} muted />
      </section>
      <p className="text-sm text-muted-foreground">{m["docs.start.help"]()}</p>
    </div>
  )
}
