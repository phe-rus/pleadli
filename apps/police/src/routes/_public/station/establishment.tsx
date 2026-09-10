import { Createpanel } from '@/components/create-panel'
import {
  establishmentOptions,
  establishmentPersonName,
  EstablishmentMemberForm,
  useEstablishment,
  type StationEstablishmentMember,
} from '@/features/station-admin'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/station/establishment')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...establishmentOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<StationEstablishmentMember | null>(null)
  const { data: establishment } = useEstablishment('')

  const columns: DataTableColumnDef<StationEstablishmentMember>[] = useMemo(() => {
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
        accessorFn: (row) => establishmentPersonName(row),
        header: 'Officer / person',
      },
      {
        accessorKey: 'post',
        header: 'Standing post',
        cell: ({ row }) => row.original.post ?? '·',
      },
      {
        accessorKey: 'rank',
        header: 'Rank',
        cell: ({ row }) => row.original.rank ?? '·',
      },
      {
        accessorKey: 'active',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.original.active ? 'default' : 'secondary'}>
            {row.original.active ? 'Currently posted' : 'Not posted'}
          </Badge>
        ),
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <h1>Station Establishment</h1>
          <p className="md:max-w-lg">
            Who is posted to this station in a standing role. Not shift scheduling (Duty Roster).
          </p>
        </div>

        <Createpanel
          open={addOpen}
          onOpenChange={setAddOpen}
          trigger={
            <Button size="sm">
              <HugeiconsIcon icon={AddCircleIcon} />
              Add to establishment
            </Button>
          }
          headings={{ title: 'Add to establishment', description: 'Who is posted to this station, and in what role.' }}
        >
          <EstablishmentMemberForm onSuccess={() => setAddOpen(false)} />
        </Createpanel>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        headings={{ title: 'Edit establishment entry', description: 'Update this posting.' }}
      >
        {editing && (
          <EstablishmentMemberForm key={editing.id} member={editing} onSuccess={() => setEditing(null)} />
        )}
      </Createpanel>

      <DataTable
        aria-label="Station establishment"
        data={establishment}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No one recorded on the establishment yet."
        searchPlaceholder="Search by name, post, or rank…"
      />
    </article>
  )
}
