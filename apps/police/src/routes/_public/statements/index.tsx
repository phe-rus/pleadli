import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import { statementsOptions, StatementForm, statementPersonName, useStatements, type Statement } from '@/features/statements'
import { RichTextPreview } from '@pleadli/rich-text'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { createFileRoute } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/statements/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...statementsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [editing, setEditing] = useState<Statement | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const { data: statements } = useStatements('')
  useDeepLinkRecord(statements, openId, setEditing)

  const columns: DataTableColumnDef<Statement>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: m["col.id"](),
        cell: ({ row }) => (
          <span
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')}
            onClick={() => setEditing(row.original)}
          >
            {row.original.id}
          </span>
        ),
      },
      { accessorKey: 'personId', header: m["col.person_id"]() },
      {
        id: 'person',
        accessorFn: (row) => statementPersonName(row),
        header: m["col.given_by"](),
      },
      { accessorKey: 'personFirstName', header: m["col.first_name"]() },
      { accessorKey: 'personLastName', header: m["col.last_name"]() },
      {
        accessorKey: 'personOtherNames',
        header: m["col.other_names"](),
        cell: ({ row }) => row.original.personOtherNames ?? '·',
      },
      {
        accessorKey: 'content',
        header: m["col.statement"](),
        cell: ({ getValue }) => (
          <RichTextPreview value={getValue<string>()} className="line-clamp-2 max-w-sm" />
        ),
      },
      { accessorKey: 'caseId', header: m["col.case_id"](), cell: ({ row }) => row.original.caseId ?? '·' },
      {
        accessorKey: 'caseReference',
        header: m["col.case"](),
        cell: ({ row }) => row.original.caseReference ?? '·',
      },
      {
        accessorKey: 'officerName',
        header: m["col.taken_by"](),
        cell: ({ row }) => row.original.officerName ?? '·',
      },
      {
        accessorKey: 'givenAt',
        header: m["col.given"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      {
        accessorKey: 'createdAt',
        header: m["col.recorded"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="page">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>{m["nav.statements"]()}</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  {m["statements.submit"]()}
                </Button>
              }
              headings={{ title: m["statements.submit"](), description: m["statements_page.add_desc"]() }}
            >
              <StatementForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">{m["statements_page.lead"]()}</p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        isDirty={editDirty}
        headings={{ title: m["statements_page.edit_title"](), description: m["statements_page.edit_desc"]() }}
      >
        {editing && (
          <StatementForm
            key={editing.id}
            statement={editing}
            onSuccess={() => setEditing(null)}
            onDirtyChange={setEditDirty}
          />
        )}
      </Createpanel>

      <DataTable
        aria-label={m["nav.statements"]()}
        data={statements}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["statements_page.empty"]()}
        searchPlaceholder={m["statements_page.search"]()}
      />
    </article>
  )
}
