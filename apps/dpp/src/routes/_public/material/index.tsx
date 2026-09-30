import * as m from '@/paraglide/messages'
import { formatDate } from '@/lib/dates'
import { EmptyNote } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { evidenceCategoryLabel } from '@/features/evidence/schema'
import { statementRoleLabel } from '@/features/statements/schema'
import { materialOptions, useMaterial, type MaterialKind, type MaterialRow } from '@/features/workload'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'

const kinds = [
  { id: 'statement', label: m["page.material.statements"], about: m["page.material.statements_about"] },
  { id: 'evidence', label: m["page.material.evidence"], about: m["page.material.evidence_about"] },
  { id: 'charge', label: m["page.material.charges"], about: m["page.material.charges_about"] },
] as const

const isKind = (value: unknown): value is MaterialKind => kinds.some((k) => k.id === value)

export const Route = createFileRoute('/_public/material/')({
  validateSearch: (search: Record<string, unknown>): { kind?: MaterialKind } => (isKind(search.kind) ? { kind: search.kind } : {}),
  loaderDeps: ({ search }) => ({ kind: search.kind ?? 'statement' }),
  loader: async ({ context, deps }) => {
    await context.queryClient.query({ ...materialOptions(deps.kind), staleTime: 'static' })
  },
  component: RouteComponent,
})

function subjectLabel(row: MaterialRow) {
  if (row.kind === 'statement') return statementRoleLabel(row.subject)
  if (row.kind === 'evidence') return evidenceCategoryLabel(row.subject)
  return row.subject
}

/** The material Police sent, read across files. It is recorded and reviewed
 * inside each file; this page is for looking across them. */
function RouteComponent() {
  const { kind = 'statement' } = Route.useSearch()
  const current = kinds.find((k) => k.id === kind) ?? kinds[0]
  const { data: rows } = useMaterial(kind)

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.police_material"]()}</h1>
          <p>{current.about()}</p>
        </div>
      </header>

      <nav aria-label={m["page.material.kinds"]()} className="-mb-2 flex gap-1 border-b border-border/60">
        {kinds.map((item) => (
          <Link
            key={item.id}
            to="/material"
            search={{ kind: item.id }}
            replace
            aria-current={item.id === kind ? 'page' : undefined}
            className={cn(
              'relative px-3 py-1.5 no-underline',
              item.id === kind ? 'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label()}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyNote>{m["page.material.empty"]()}</EmptyNote>
      ) : (
        <RowList>
          {rows.map((row) => (
            <Row
              key={row.id}
              title={row.detail ? `${subjectLabel(row)}: ${row.detail}` : subjectLabel(row)}
              summary={
                <>
                  <Link to="/files/$fileId" params={{ fileId: row.fileId }} search={{ tab: 'material' }} className="text-foreground">
                    {row.fileTitle}
                  </Link>
                  {row.fileReference ? `, ${row.fileReference}` : ''}
                </>
              }
              trailing={<Tag tone="neutral">{formatDate(row.at)}</Tag>}
            />
          ))}
        </RowList>
      )}
    </article>
  )
}
