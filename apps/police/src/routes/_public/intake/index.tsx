import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import { caseStatuses, casesOptions, CaseForm, useCases, type Case } from '@/features/cases'
import { AddCircleIcon, BinocularsIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from '@/lib/date'
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
        header: m["col.id"](),
        cell: ({ row }) => (
          <span
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')}
            onClick={() => setEditingCase(row.original)}
          >
            {row.original.id}
          </span>
        ),
      },
      { accessorKey: 'reference', header: m["col.reference"]() },
      { accessorKey: 'summary', header: m["col.summary"]() },
      {
        accessorKey: 'status',
        header: m["col.status"](),
        cell: ({ getValue }) => statusLabel(getValue<string>()),
      },
      { accessorKey: 'incidentId', header: m["col.incident_id"](), cell: ({ row }) => row.original.incidentId ?? '·' },
      {
        accessorKey: 'incidentSummary',
        header: m["col.related_incident"](),
        cell: ({ row }) => row.original.incidentSummary ?? '·',
      },
      { accessorKey: 'peopleCount', header: m["col.people"]() },
      {
        accessorKey: 'createdAt',
        header: m["col.opened"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      {
        id: 'investigate',
        header: '',
        cell: ({ row }) => (
          <Link
            to="/investigations/$caseId"
            params={{ caseId: row.original.id }}
            className={cn(buttonVariants({ size: 'icon-xs', variant: 'ghost' }))}
            aria-label={m["common.open_investigation"]()}
            title={m["common.open_investigation"]()}
          >
            <HugeiconsIcon icon={BinocularsIcon} />
          </Link>
        ),
      },
    ]
  }, [])

  return (
    <article className="page">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>{m["intake_page.title"]()}</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  {m["cases.submit"]()}
                </Button>
              }
              headings={{ title: m["cases.submit"](), description: m["intake_page.add_desc"]() }}
            >
              <CaseForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">{m["intake_page.lead"]()}</p>
        </div>
      </section>

      <Createpanel
        open={editingCase !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCase(null)
        }}
        isDirty={editDirty}
        headings={{ title: m["intake_page.edit_title"](), description: m["intake_page.edit_desc"]() }}
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
        aria-label={m["intake_page.table"]()}
        data={cases}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["intake_page.empty"]()}
        searchPlaceholder={m["intake_page.search"]()}
      />
    </article>
  )
}
