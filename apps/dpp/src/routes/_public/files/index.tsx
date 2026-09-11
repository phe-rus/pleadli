import { Createpanel } from '@/components/create-panel'
import {
  fileStatusLabel,
  prosecutionFilesOptions,
  ProsecutionFileForm,
  useProsecutionFiles,
  type ProsecutionFile,
} from '@/features/prosecution-files'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useEffect, useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/files/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...prosecutionFilesOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

/**
 * Files has its own detail route (`/files/$fileId`, the Charging Review
 * workspace) rather than an in-place drawer, so a deep link with `?open=`
 * (from Search or the Overview queue) redirects straight there instead of
 * reusing the drawer-based useDeepLinkRecord pattern Police's list routes
 * use for same-page edit drawers.
 */
function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const { data: files } = useProsecutionFiles('')

  useEffect(() => {
    if (openId) {
      navigate({ to: '/files/$fileId', params: { fileId: openId } })
    }
  }, [openId, navigate])

  const columns: DataTableColumnDef<ProsecutionFile>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => (
          <Link
            to="/files/$fileId"
            params={{ fileId: row.original.id }}
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'inline-block max-w-sm truncate')}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'odppRegistrationNumber',
        header: 'ODPP reg. no.',
        cell: ({ row }) => row.original.odppRegistrationNumber ?? '·',
      },
      {
        accessorKey: 'policeReference',
        header: 'Police reference',
        cell: ({ row }) => row.original.policeReference ?? '·',
      },
      {
        accessorKey: 'policeStation',
        header: 'Police station',
        cell: ({ row }) => row.original.policeStation ?? '·',
      },
      {
        accessorKey: 'courtCaseNumber',
        header: 'Court case no.',
        cell: ({ row }) => row.original.courtCaseNumber ?? '·',
      },
      {
        accessorKey: 'currentStatus',
        header: 'Status',
        cell: ({ getValue }) => <Badge variant="outline">{fileStatusLabel(getValue<string>())}</Badge>,
      },
      {
        accessorKey: 'receivedAt',
        header: 'Received',
        cell: ({ getValue }) => format(getValue<number>(), 'PP'),
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>Files</h1>

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
          <p className="md:max-w-sm">Every prosecution file ODPP is handling — Intake shows only what's still awaiting a decision.</p>
        </div>
      </section>

      <DataTable
        aria-label="Prosecution files"
        data={files}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No files opened yet."
        searchPlaceholder="Search files…"
      />
    </article>
  )
}
