import * as m from '@/paraglide/messages'
import { caseStatuses, casesOptions, useCases } from '@/features/cases'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/investigations/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...casesOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function statusLabel(status: string) {
  return caseStatuses.find((s) => s.value === status)?.label ?? status
}

function RouteComponent() {
  const { data: cases } = useCases('')

  return (
    <article className="page">
      <section className="flex flex-col">
        <h1>{m["nav.investigations"]()}</h1>
        <p className="md:max-w-sm">
          {m["investigation.list_lead"]()}
        </p>
      </section>

      {cases.length === 0 ? (
        <p className="text-xs text-muted-foreground">{m["intake_page.empty"]()}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {cases.map((c) => (
            <Link
              key={c.id}
              to="/investigations/$caseId"
              params={{ caseId: c.id }}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.reference}</p>
                <p className="truncate text-xs text-muted-foreground">{c.summary}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {statusLabel(c.status)} · {m["investigation.people_count"]({ count: c.peopleCount })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </article>
  )
}
