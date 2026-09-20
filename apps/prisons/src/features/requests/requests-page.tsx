import { Createpanel } from '@/components/create-panel'
import { prisonerFullName } from '@/features/prisoners'
import { RequestForm } from './request-form'
import { ResolveRequestForm } from './resolve-request-form'
import { requestCategoryLabel, type PrisonRequest } from './schema'
import { useRequests } from './queries'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { RichTextPreview } from '@pleadli/rich-text'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'
import { m } from '@/paraglide/messages'

/**
 * Communication & Requests (docs/prisons/PRODUCT.md, RESEARCH.md §11.6) —
 * the Human Rights Committee / "Mukutano" grievance mechanism. A plain
 * complaint log: who raised it (may be unlinked to a specific prisoner),
 * category, date, and outcome once "further action" is taken.
 */
export function RequestsPage() {
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
        header: m.route_requests_prisoner(),
        cell: ({ row }) =>
          row.original.prisonerFirstName
            ? prisonerFullName({ firstName: row.original.prisonerFirstName, lastName: row.original.prisonerLastName ?? '', otherNames: null })
            : m.route_requests_not_linked(),
      },
      {
        accessorKey: 'category',
        header: m.route_requests_category(),
        cell: ({ getValue }) => <Badge variant="outline">{requestCategoryLabel(getValue<string>())}</Badge>,
      },
      { accessorKey: 'description', header: m.route_requests_description() },
      { accessorKey: 'raisedAt', header: m.route_requests_raised(), cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
      {
        id: 'status',
        header: m.route_requests_status(),
        cell: ({ row }) =>
          row.original.resolvedAt ? (
            <Badge variant="secondary">{m.route_requests_resolved({ resolvedAt: format(row.original.resolvedAt, 'PP') })}</Badge>
          ) : (
            <Badge variant="destructive">{m.route_requests_open()}</Badge>
          ),
      },
    ]
  }, [])

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.route_requests_title()}</h1>
          <p className="md:max-w-sm">{m.route_requests_food_remand_overstay_general_welfare_and()}</p>
        </div>
        <div className="page-actions">
          <Createpanel
            open={addOpen}
            onOpenChange={setAddOpen}
            isDirty={addDirty}
            trigger={
              <Button size="sm">
                <HugeiconsIcon icon={AddCircleIcon} />
                {m.route_requests_record_complaint()}
              </Button>
            }
            headings={{ title: m.route_requests_record_complaint(), description: m.route_requests_log_a_complaint_raised_via_the() }}
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
        headings={{ title: m.route_requests_complaint(), description: m.route_requests_record_what_further_action_was_taken() }}
      >
        {selected &&
          (selected.resolvedAt ? (
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm">
              <p className="text-muted-foreground">{selected.description}</p>
              <p className="text-xs text-muted-foreground">{m.route_requests_resolved({ resolvedAt: format(selected.resolvedAt, 'PPp') })}</p>
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
        aria-label={m.route_requests_requests_and_complaints()}
        data={requests}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m.route_requests_no_complaints_recorded_yet()}
        searchPlaceholder={m.route_requests_search_complaints()}
      />
    </article>
  )
}
