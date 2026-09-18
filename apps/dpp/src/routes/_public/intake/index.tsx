import { Createpanel } from '@/components/create-panel'
import {
  fileStatusLabel,
  intakeQueueOptions,
  ProsecutionFileForm,
  useIntakeQueue,
  type ProsecutionFile,
} from '@/features/prosecution-files'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/intake/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...intakeQueueOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/**
 * The Police -> DPP handoff as a real, first-class incoming-work view
 * (docs/dpp/PRODUCT.md §Intake & Referrals) — a filtered queue over the
 * same Prosecution Files data (files still awaiting a charging decision,
 * or returned for further investigation), not a separate table. "Files"
 * is the full browse-everything view; this is "what's still waiting."
 */
function RouteComponent() {
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const { data: files } = useIntakeQueue()

  const columns: DataTableColumnDef<ProsecutionFile>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <Link
            to="/files/$fileId"
            params={{ fileId: row.original.id }}
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'inline-block')}
          >
            {row.original.id}
          </Link>
        ),
      },
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => <span className="inline-block max-w-sm truncate">{row.original.title}</span>,
      },
      {
        accessorKey: 'odppRegistrationNumber',
        header: 'ODPP reg. no.',
        cell: ({ row }) => row.original.odppRegistrationNumber ?? '·',
      },
      {
        accessorKey: 'policeStation',
        header: 'Police station',
        cell: ({ row }) => row.original.policeStation ?? '·',
      },
      {
        accessorKey: 'policeReference',
        header: 'Police reference',
        cell: ({ row }) => row.original.policeReference ?? '·',
      },
      {
        accessorKey: 'currentStatus',
        header: 'Status',
        cell: ({ getValue }) => <Badge variant="outline">{fileStatusLabel(getValue<string>())}</Badge>,
      },
      {
        accessorKey: 'receivedAt',
        header: 'Received',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>Intake</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  Open new file
                </Button>
              }
              headings={{ title: 'Open file', description: 'Log a matter referred by Police.' }}
            >
              <ProsecutionFileForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">Files still awaiting a charging decision, or returned to Police for further investigation.</p>
        </div>
      </section>

      <DataTable
        aria-label="Intake queue"
        data={files}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="Nothing awaiting a decision."
        searchPlaceholder="Search intake…"
      />
    </article>
  )
}
