import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import {
  chargeSheetAccusedName,
  chargeSheetsOptions,
  ChargeSheetForm,
  useChargeSheets,
  type ChargeSheet,
} from '@/features/legal-forms'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { AddCircleIcon, ViewIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/legal-forms/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...chargeSheetsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [editing, setEditing] = useState<ChargeSheet | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const { data: chargeSheets } = useChargeSheets('')
  useDeepLinkRecord(chargeSheets, openId, setEditing)

  const columns: DataTableColumnDef<ChargeSheet>[] = useMemo(() => {
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
      { accessorKey: 'caseId', header: m["col.case_id"]() },
      { accessorKey: 'caseReference', header: m["col.case"]() },
      { accessorKey: 'caseSummary', header: m["col.case_summary"]() },
      {
        accessorKey: 'accusedPersonId',
        header: m["col.accused_person_id"](),
        cell: ({ row }) => row.original.accusedPersonId ?? '·',
      },
      {
        id: 'accused',
        accessorFn: (row) => chargeSheetAccusedName(row) ?? '',
        header: m["col.accused"](),
        cell: ({ getValue }) => getValue<string>() || '·',
      },
      {
        accessorKey: 'accusedFirstName',
        header: m["col.accused_first_name"](),
        cell: ({ row }) => row.original.accusedFirstName ?? '·',
      },
      {
        accessorKey: 'accusedLastName',
        header: m["col.accused_last_name"](),
        cell: ({ row }) => row.original.accusedLastName ?? '·',
      },
      {
        accessorKey: 'accusedOtherNames',
        header: m["col.accused_other_names"](),
        cell: ({ row }) => row.original.accusedOtherNames ?? '·',
      },
      { accessorKey: 'offence', header: m["col.offence"]() },
      { accessorKey: 'statutorySection', header: m["col.statutory_section"]() },
      { accessorKey: 'particulars', header: m["col.particulars"]() },
      {
        accessorKey: 'chargedAt',
        header: m["col.charged"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      { accessorKey: 'officerName', header: m["col.officer"](), cell: ({ row }) => row.original.officerName ?? '·' },
      { accessorKey: 'stationName', header: m["col.station"](), cell: ({ row }) => row.original.stationName ?? '·' },
      {
        accessorKey: 'createdAt',
        header: m["col.drawn_up"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      {
        id: 'view',
        header: '',
        cell: ({ row }) => (
          <Link
            to="/legal-forms/$chargeSheetId"
            params={{ chargeSheetId: row.original.id }}
            className={cn(buttonVariants({ size: 'icon-xs', variant: 'ghost' }))}
            aria-label={m["legal_page.view"]()}
            title={m["legal_page.view"]()}
          >
            <HugeiconsIcon icon={ViewIcon} />
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
            <h1>{m["legal_page.title"]()}</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  {m["charge_sheet.submit"]()}
                </Button>
              }
              headings={{ title: m["charge_sheet.submit"](), description: m["legal_page.add_desc"]() }}
            >
              <ChargeSheetForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">
            {m["legal_page.lead"]()}
          </p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        isDirty={editDirty}
        headings={{ title: m["legal_page.edit_title"](), description: m["legal_page.edit_desc"]() }}
      >
        {editing && (
          <ChargeSheetForm
            key={editing.id}
            chargeSheet={editing}
            onSuccess={() => setEditing(null)}
            onDirtyChange={setEditDirty}
          />
        )}
      </Createpanel>

      <DataTable
        aria-label={m["legal_page.table"]()}
        data={chargeSheets}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["legal_page.empty"]()}
        searchPlaceholder={m["legal_page.search"]()}
      />
    </article>
  )
}
