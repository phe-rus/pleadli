import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import { officerRoleLabel, officersOptions, OfficerForm, useOfficers, type Officer } from '@/features/officers'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/station/officers')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...officersOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [editing, setEditing] = useState<Officer | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const { data: officers } = useOfficers()
  const here = officers.filter((o) => o.active).length

  const columns: DataTableColumnDef<Officer>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: m["col.id"](),
        cell: ({ row }) => (
          <span className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')} onClick={() => setEditing(row.original)}>
            {row.original.id}
          </span>
        ),
      },
      { accessorKey: 'name', header: m["col.name"]() },
      { accessorKey: 'rank', header: m["col.rank"](), cell: ({ row }) => row.original.rank ?? '·' },
      { accessorKey: 'post', header: m["col.standing_post"](), cell: ({ row }) => row.original.post ?? '·' },
      { accessorKey: 'badgeNumber', header: m["col.badge_number"](), cell: ({ row }) => row.original.badgeNumber ?? '·' },
      {
        accessorKey: 'role',
        header: m["col.role"](),
        cell: ({ row }) => <Badge variant="secondary">{officerRoleLabel(row.original.role)}</Badge>,
      },
      {
        accessorKey: 'hasSignIn',
        header: m["col.remote_sign_in"](),
        cell: ({ row }) => (row.original.hasSignIn ? m["common.yes"]() : m["common.no"]()),
      },
      {
        accessorKey: 'active',
        header: m["col.status"](),
        cell: ({ row }) => <Badge variant={row.original.active ? 'default' : 'secondary'}>{row.original.active ? m["officers_page.at_station"]() : m["officers_page.left"]()}</Badge>,
      },
      { accessorKey: 'personId', header: m["col.person_id"](), cell: ({ row }) => row.original.personId ?? '·' },
      { accessorKey: 'notes', header: m["col.notes"](), cell: ({ row }) => row.original.notes ?? '·' },
      {
        accessorKey: 'createdAt',
        header: m["col.added"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["common.officers"]()}</h1>
          <p>{m["officers_page.lead"]({ here, left: officers.length - here })}</p>
        </div>
        <div className="page-actions">
          <Createpanel
            open={addOpen}
            onOpenChange={setAddOpen}
            isDirty={addDirty}
            trigger={
              <Button size="sm">
                <HugeiconsIcon icon={AddCircleIcon} />
                {m["officers.submit"]()}
              </Button>
            }
            headings={{ title: m["officers.submit"](), description: m["officers_page.add_desc"]() }}
          >
            <OfficerForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
          </Createpanel>
        </div>
      </header>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        isDirty={editDirty}
        headings={{ title: m["officers_page.edit_title"](), description: m["officers_page.edit_desc"]() }}
      >
        {editing && <OfficerForm key={editing.id} officer={editing} onSuccess={() => setEditing(null)} onDirtyChange={setEditDirty} />}
      </Createpanel>

      <DataTable
        aria-label={m["common.officers"]()}
        data={officers}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["officers_page.empty"]()}
        searchPlaceholder={m["officers_page.search"]()}
      />
    </article>
  )
}
