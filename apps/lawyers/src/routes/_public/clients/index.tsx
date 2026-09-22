import { PanelButton } from '@/components/add-panel'
import { Createpanel } from '@/components/create-panel'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { ClientForm, clientsOptions, custodyLabel, useClients, type ClientSummary } from '@/features/clients'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/clients/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...clientsOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** The people you act for. A client has no page of its own: the ID opens the
 * client to edit, and their matters are in Matters. */
function RouteComponent() {
  const { data: clients } = useClients()
  const [editing, setEditing] = useState<ClientSummary | null>(null)
  const [dirty, setDirty] = useState(false)

  const columns: DataTableColumnDef<ClientSummary>[] = useMemo(
    () => [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <button type="button" onClick={() => setEditing(row.original)} className={cn('inline-block cursor-pointer rounded-md bg-primary/15 px-3 py-1 text-xs')}>
            {row.original.id}
          </button>
        ),
      },
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone ?? '·' },
      { accessorKey: 'address', header: 'Address', cell: ({ row }) => row.original.address ?? '·' },
      {
        accessorKey: 'custody',
        header: 'Custody',
        cell: ({ row }) =>
          row.original.custody ? (
            <Tag tone={row.original.custody === 'at_liberty' ? 'done' : 'waiting'}>
              {custodyLabel(row.original.custody)}
              {row.original.custodyPlace ? `, ${row.original.custodyPlace}` : ''}
            </Tag>
          ) : (
            '·'
          ),
      },
      { accessorKey: 'matters', header: 'Matters' },
      { accessorKey: 'openMatters', header: 'Open' },
      { accessorKey: 'notes', header: 'Notes', cell: ({ row }) => <span className="inline-block max-w-xs truncate">{row.original.notes ?? '·'}</span> },
      { accessorKey: 'createdAt', header: 'Added', cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
    ],
    [],
  )

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Clients</h1>
          <p>The people you act for, and where an accused client is held.</p>
        </div>
        <div className="page-actions">
          <PanelButton label="Add a client" title="Add a client" description="Someone you act for." variant="default">
            {({ close, setDirty: report }) => <ClientForm onSuccess={close} onDirtyChange={report} />}
          </PanelButton>
        </div>
      </header>

      {clients.length === 0 ? (
        <EmptyNote>You have no clients yet. Add one, then open a matter for them.</EmptyNote>
      ) : (
        <DataTable aria-label="Clients" data={clients} columns={columns} getRowId={(row) => row.id} emptyMessage="No clients." searchPlaceholder="Search clients" />
      )}

      <Createpanel
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
            setDirty(false)
          }
        }}
        isDirty={dirty}
        headings={{ title: 'Edit the client', description: 'Change their details, or where they are held.' }}
      >
        {editing && <ClientForm existing={editing} onDirtyChange={setDirty} onSuccess={() => setEditing(null)} />}
      </Createpanel>
    </article>
  )
}
