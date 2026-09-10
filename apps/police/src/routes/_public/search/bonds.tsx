import { Createpanel } from '@/components/create-panel'
import { BondForm, bondPersonName, bondsOptions, bondStatusLabel, useBonds, type Bond } from '@/features/bonds'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/search/bonds')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...bondsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [editing, setEditing] = useState<Bond | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const { data: bonds } = useBonds('')
  useDeepLinkRecord(bonds, openId, setEditing)

  const columns: DataTableColumnDef<Bond>[] = useMemo(() => {
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
      {
        id: 'person',
        accessorFn: (row) => bondPersonName(row),
        header: 'Person',
      },
      {
        accessorKey: 'withSurety',
        header: 'Surety',
        cell: ({ row }) => (row.original.withSurety ? row.original.suretyName ?? 'Yes' : 'None'),
      },
      {
        accessorKey: 'reportingSchedule',
        header: 'Reporting',
        cell: ({ row }) => row.original.reportingSchedule ?? '·',
      },
      {
        accessorKey: 'officerName',
        header: 'Granting officer',
        cell: ({ row }) =>
          [row.original.officerRank, row.original.officerName].filter(Boolean).join(' ') || '·',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => bondStatusLabel(row.original.status),
      },
      {
        accessorKey: 'grantedAt',
        header: 'Granted',
        cell: ({ getValue }) => new Date(getValue<number>()).toLocaleString(),
      },
      {
        accessorKey: 'caseReference',
        header: 'Case',
        cell: ({ row }) => row.original.caseReference ?? '·',
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>Bonds &amp; sureties</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  Grant bond
                </Button>
              }
              headings={{ title: 'Grant bond', description: "Record a police bond, mirroring the PF18 form's fields." }}
            >
              <BondForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">Police bond, distinct from court bail: granted here, not by a magistrate.</p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        isDirty={editDirty}
        headings={{ title: 'Edit bond', description: 'Update this bond.' }}
      >
        {editing && (
          <BondForm
            key={editing.id}
            bond={editing}
            onSuccess={() => setEditing(null)}
            onDirtyChange={setEditDirty}
          />
        )}
      </Createpanel>

      <DataTable
        aria-label="Bonds"
        data={bonds}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No bonds granted yet."
        searchPlaceholder="Search bonds…"
      />
    </article>
  )
}
