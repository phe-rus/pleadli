import { Createpanel } from '@/components/create-panel'
import { caseStatuses, casesOptions, CaseForm, useCases, type Case } from '@/features/cases'
import { AddCircleIcon, BinocularsIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/intake/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...casesOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function statusLabel(status: string) {
  return caseStatuses.find((s) => s.value === status)?.label ?? status
}

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [editingCase, setEditingCase] = useState<Case | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const { data: cases } = useCases('')
  useDeepLinkRecord(cases, openId, setEditingCase)

  const columns: DataTableColumnDef<Case>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <span
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')}
            onClick={() => setEditingCase(row.original)}
          >
            {row.original.id}
          </span>
        ),
      },
      { accessorKey: 'reference', header: 'Reference' },
      { accessorKey: 'summary', header: 'Summary' },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => statusLabel(getValue<string>()),
      },
      {
        accessorKey: 'incidentSummary',
        header: 'Related incident',
        cell: ({ row }) => row.original.incidentSummary ?? '·',
      },
      { accessorKey: 'peopleCount', header: 'People' },
      {
        accessorKey: 'createdAt',
        header: 'Opened',
        cell: ({ getValue }) => new Date(getValue<number>()).toLocaleString(),
      },
      {
        id: 'investigate',
        header: '',
        cell: ({ row }) => (
          <Link
            to="/investigations/$caseId"
            params={{ caseId: row.original.id }}
            className={cn(buttonVariants({ size: 'icon-xs', variant: 'ghost' }))}
            aria-label="Open investigation"
            title="Open investigation"
          >
            <HugeiconsIcon icon={BinocularsIcon} />
          </Link>
        ),
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>Case Intake</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  Open case
                </Button>
              }
              headings={{ title: 'Open case', description: 'Start formal handling of a matter.' }}
            >
              <CaseForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">Formal police handling of a matter: one dimension among several, not the root everything else hangs off.</p>
        </div>
      </section>

      <Createpanel
        open={editingCase !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCase(null)
        }}
        isDirty={editDirty}
        headings={{ title: 'Edit case', description: 'Update this case.' }}
      >
        {editingCase && (
          <CaseForm
            key={editingCase.id}
            case={editingCase}
            onSuccess={() => setEditingCase(null)}
            onDirtyChange={setEditDirty}
          />
        )}
      </Createpanel>

      <DataTable
        aria-label="Cases"
        data={cases}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No cases opened yet."
        searchPlaceholder="Search cases…"
      />
    </article>
  )
}
