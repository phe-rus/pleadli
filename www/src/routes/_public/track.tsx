import { CodeForm, codeSearch, formatDate } from '@/components/public-code'
import { trackCase } from '@/functions/public.func'
import { TRACKING_STAGES } from '@/lib/orchestra'
import { seo } from '@/lib/seo'
import * as m from '@/paraglide/messages'
import { CancelCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Card } from '@pleadli/ui/card'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/track')({
  head: () => seo({ title: m["track.meta_title"](), description: m["track.meta_description"](), path: '/track' }),
  validateSearch: codeSearch,
  loaderDeps: ({ search }) => ({ code: search.code }),
  loader: ({ deps }) => (deps.code ? trackCase({ data: { code: deps.code } }) : undefined),
  component: RouteComponent,
})

const stages: Record<(typeof TRACKING_STAGES)[number], () => string> = {
  reported: () => m["track.stage.reported"](),
  investigating: () => m["track.stage.investigating"](),
  with_dpp: () => m["track.stage.with_dpp"](),
  charged: () => m["track.stage.charged"](),
  in_court: () => m["track.stage.in_court"](),
  remanded: () => m["track.stage.remanded"](),
  on_bail: () => m["track.stage.on_bail"](),
  judgment: () => m["track.stage.judgment"](),
  released: () => m["track.stage.released"](),
  closed: () => m["track.stage.closed"](),
}

const stageName = (stage: string) => stages[stage as keyof typeof stages]?.() ?? stage

function RouteComponent() {
  const { code } = Route.useSearch()
  const result = Route.useLoaderData()
  const [now, ...earlier] = result?.steps ?? []

  return (
    <article className="container flex w-full flex-col md:max-w-3xl">
      <section className="editorial-hero">
        <h1 className="text-4xl! font-semibold tracking-tight md:text-6xl!">{m["track.title"]()}</h1>
        <p className="md:max-w-xl md:text-lg!">{m["track.lead"]()}</p>
        <CodeForm from="/track" code={code} label={m["track.code"]()} hint={m["track.code_hint"]()} submit={m["track.check"]()} />
      </section>

      {code && !now && (
        <Card className="flex-row gap-4 p-6">
          <HugeiconsIcon icon={CancelCircleIcon} className="mt-1 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <h2 className="text-xl!">{m["track.not_found"]()}</h2>
            <p className="text-muted-foreground">{m["track.not_found_body"]()}</p>
          </div>
        </Card>
      )}

      {now && (
        <div className="flex flex-col gap-8">
          <Card className="gap-2 p-6">
            <span className="text-sm text-muted-foreground">{m["track.now"]()}</span>
            <h2 className="text-2xl!">{stageName(now.stage)}</h2>
            {now.office && <p>{now.office}</p>}
            <p className="text-muted-foreground">{m["track.since"]({ date: formatDate(now.at) })}</p>
            {now.nextAt && <p className="font-semibold">{m["track.next"]({ date: formatDate(now.nextAt) })}</p>}
          </Card>

          {earlier.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-lg!">{m["track.history"]()}</h2>
              <ol className="flex flex-col gap-4 border-l border-border pl-5">
                {earlier.map((step) => (
                  <li key={`${step.stage}-${step.at}`} className="flex flex-col">
                    <span className="font-medium">{stageName(step.stage)}</span>
                    <span className="text-sm text-muted-foreground">
                      {[step.office, formatDate(step.at)].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}

      <p className="py-16 text-sm text-muted-foreground">{m["track.privacy"]()}</p>
    </article>
  )
}
