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
      { accessorKey: 'caseReference', header: 'Case' },
      {
        id: 'accused',
        accessorFn: (row) => chargeSheetAccusedName(row) ?? '',
        header: 'Accused',
        cell: ({ getValue }) => getValue<string>() || '·',
      },
      { accessorKey: 'offence', header: 'Offence' },
      { accessorKey: 'statutorySection', header: 'Statutory section' },
      {
        accessorKey: 'chargedAt',
        header: 'Charged',
        cell: ({ getValue }) => new Date(getValue<number>()).toLocaleString(),
      },
      {
        id: 'view',
        header: '',
        cell: ({ row }) => (
          <Link
            to="/legal-forms/$chargeSheetId"
            params={{ chargeSheetId: row.original.id }}
            className={cn(buttonVariants({ size: 'icon-xs', variant: 'ghost' }))}
            aria-label="View charge sheet"
            title="View charge sheet"
          >
            <HugeiconsIcon icon={ViewIcon} />
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
            <h1>Charge Sheets &amp; Forms</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  Draw up charge sheet
                </Button>
              }
              headings={{ title: 'Draw up charge sheet', description: 'PF53, generated from data already in Pleadli.' }}
            >
              <ChargeSheetForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">
            Generated from Case and Person data already in the system. Only the offence, statutory section, and
            particulars are new.
          </p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        isDirty={editDirty}
        headings={{ title: 'Edit charge sheet', description: 'Update this charge sheet.' }}
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
        aria-label="Charge sheets"
        data={chargeSheets}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No charge sheets drawn up yet."
        searchPlaceholder="Search by offence, case reference, or accused…"
      />
    </article>
  )
}
