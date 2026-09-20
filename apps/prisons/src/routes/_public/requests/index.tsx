import { Createpanel } from '@/components/create-panel'
import { prisonerFullName } from '@/features/prisoners'
import {
  RequestForm,
  ResolveRequestForm,
  requestCategoryLabel,
  requestsOptions,
  useRequests,
  type PrisonRequest,
} from '@/features/requests'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { RichTextPreview } from '@pleadli/rich-text'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/requests/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...requestsOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/**
 * Communication & Requests (docs/prisons/PRODUCT.md, RESEARCH.md §11.6) —
 * the Human Rights Committee / "Mukutano" grievance mechanism. A plain
 * complaint log: who raised it (may be unlinked to a specific prisoner),
 * category, date, and outcome once "further action" is taken.
 */
function RouteComponent() {
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [selected, setSelected] = useState<PrisonRequest | null>(null)
  const [selectedDirty, setSelectedDirty] = useState(false)
  const { data: requests } = useRequests()

  const columns: DataTableColumnDef<PrisonRequest>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <span
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')}
            onClick={() => setSelected(row.original)}
          >
            {row.original.id}
          </span>
        ),
      },
      {
        id: 'prisoner',
        header: 'Prisoner',
        cell: ({ row }) =>
          row.original.prisonerFirstName
            ? prisonerFullName({ firstName: row.original.prisonerFirstName, lastName: row.original.prisonerLastName ?? '', otherNames: null })
            : 'Not linked',
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ getValue }) => <Badge variant="outline">{requestCategoryLabel(getValue<string>())}</Badge>,
      },
      { accessorKey: 'description', header: 'Description' },
      { accessorKey: 'raisedAt', header: 'Raised', cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.resolvedAt ? (
            <Badge variant="secondary">Resolved {format(row.original.resolvedAt, 'PP')}</Badge>
          ) : (
            <Badge variant="destructive">Open</Badge>
          ),
      },
    ]
  }, [])

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Requests &amp; Complaints</h1>
          <p className="md:max-w-sm">Food, remand overstay, general welfare, and other complaints raised through the facility's grievance mechanism.</p>
        </div>
        <div className="page-actions">
          <Createpanel
            open={addOpen}
            onOpenChange={setAddOpen}
            isDirty={addDirty}
            trigger={
              <Button size="sm">
                <HugeiconsIcon icon={AddCircleIcon} />
                Record complaint
              </Button>
            }
            headings={{ title: 'Record complaint', description: 'Log a complaint raised via the Human Rights Committee ("Mukutano") mechanism.' }}
          >
            <RequestForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
          </Createpanel>
        </div>
      </header>

      <Createpanel
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        isDirty={selectedDirty}
        headings={{ title: 'Complaint', description: 'Record what further action was taken.' }}
      >
        {selected &&
          (selected.resolvedAt ? (
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm">
              <p className="text-muted-foreground">{selected.description}</p>
              <p className="text-xs text-muted-foreground">Resolved {format(selected.resolvedAt, 'PPp')}</p>
              <RichTextPreview value={selected.outcomeNote} className="text-muted-foreground" />
            </div>
          ) : (
            <ResolveRequestForm
              key={selected.id}
              request={selected}
              onSuccess={() => setSelected(null)}
              onDirtyChange={setSelectedDirty}
            />
          ))}
      </Createpanel>

      <DataTable
        aria-label="Requests and complaints"
        data={requests}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No complaints recorded yet."
        searchPlaceholder="Search complaints…"
      />
    </article>
  )
}
