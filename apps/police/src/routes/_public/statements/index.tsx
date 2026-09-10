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
import { format } from 'date-fns/format'
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
        header: 'ID',
        cell: ({ row }) => (
          <span
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')}
            onClick={() => setEditing(row.original)}
          >
            {row.original.id}
          </span>
        ),
      },
      { accessorKey: 'personId', header: 'Person ID' },
      {
        id: 'person',
        accessorFn: (row) => statementPersonName(row),
        header: 'Given by',
      },
      { accessorKey: 'personFirstName', header: 'First name' },
      { accessorKey: 'personLastName', header: 'Last name' },
      {
        accessorKey: 'personOtherNames',
        header: 'Other names',
        cell: ({ row }) => row.original.personOtherNames ?? '·',
      },
      {
        accessorKey: 'content',
        header: 'Statement',
        cell: ({ getValue }) => (
          <RichTextPreview value={getValue<string>()} className="line-clamp-2 max-w-sm" />
        ),
      },
      { accessorKey: 'caseId', header: 'Case ID', cell: ({ row }) => row.original.caseId ?? '·' },
      {
        accessorKey: 'caseReference',
        header: 'Case',
        cell: ({ row }) => row.original.caseReference ?? '·',
      },
      {
        accessorKey: 'officerName',
        header: 'Taken by',
        cell: ({ row }) => row.original.officerName ?? '·',
      },
      {
        accessorKey: 'givenAt',
        header: 'Given',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      {
        accessorKey: 'createdAt',
        header: 'Recorded',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>Statements</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  Record statement
                </Button>
              }
              headings={{ title: 'Record statement', description: 'What was said, by whom, and taken by whom.' }}
            >
              <StatementForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">First-class records with their own accountability, not text attached to a case.</p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        isDirty={editDirty}
        headings={{ title: 'Edit statement', description: 'Update this statement.' }}
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
        aria-label="Statements"
        data={statements}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No statements recorded yet."
        searchPlaceholder="Search statements…"
      />
    </article>
  )
}
