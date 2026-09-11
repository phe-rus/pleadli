import { Createpanel } from '@/components/create-panel'
import {
  custodyStatusLabel,
  prisonerFullName,
  prisonerStatusLabel,
  prisonersOptions,
  PrisonerForm,
  usePrisoners,
  type Prisoner,
} from '@/features/prisoners'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useEffect, useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/prisoners/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...prisonersOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

/**
 * Prisoners has its own detail route ($prisonerId, the custody/remand/
 * release/documents workspace) rather than an in-place drawer — a deep
 * link with ?open= redirects straight there, same pattern DPP's Files
 * list uses.
 */
function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const { data: prisoners } = usePrisoners('')

  useEffect(() => {
    if (openId) {
      navigate({ to: '/prisoners/$prisonerId', params: { prisonerId: openId } })
    }
  }, [openId, navigate])

  const columns: DataTableColumnDef<Prisoner>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        id: 'name',
        accessorFn: (row) => prisonerFullName(row),
        header: 'Name',
        cell: ({ row }) => (
          <Link
            to="/prisoners/$prisonerId"
            params={{ prisonerId: row.original.id }}
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'inline-block max-w-sm truncate')}
          >
            {prisonerFullName(row.original)}
          </Link>
        ),
      },
      { accessorKey: 'reference', header: 'Reference', cell: ({ row }) => row.original.reference ?? '·' },
      {
        accessorKey: 'status',
        header: 'Category',
        cell: ({ getValue }) => <Badge variant="secondary">{prisonerStatusLabel(getValue<string>())}</Badge>,
      },
      {
        accessorKey: 'currentStatus',
        header: 'Custody status',
        cell: ({ getValue }) => <Badge variant="outline">{custodyStatusLabel(getValue<string>())}</Badge>,
      },
      { accessorKey: 'admissionAuthority', header: 'Admission authority', cell: ({ row }) => row.original.admissionAuthority ?? '·' },
      { accessorKey: 'admittedAt', header: 'Admitted', cell: ({ getValue }) => format(getValue<number>(), 'PP') },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>Prisoners</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  Admit prisoner
                </Button>
              }
              headings={{ title: 'Admit prisoner', description: 'Receive a prisoner under a warrant or order.' }}
            >
              <PrisonerForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">Every prisoner this installation is responsible for.</p>
        </div>
      </section>

      <DataTable
        aria-label="Prisoners"
        data={prisoners}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No prisoners admitted yet."
        searchPlaceholder="Search prisoners…"
      />
    </article>
  )
}
