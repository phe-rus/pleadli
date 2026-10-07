import { PanelButton } from '@/components/add-panel'
import { Createpanel } from '@/components/create-panel'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { ClientForm, clientsOptions, custodyLabel, useClients, type ClientSummary } from '@/features/clients'
import * as m from '@/paraglide/messages'
import { UserGroupIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { createFileRoute } from '@tanstack/react-router'
import { formatDay } from '@/lib/dates'
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
        accessorKey: 'name',
        header: m["clients.col.name"](),
        cell: ({ row }) => (
          <button type="button" onClick={() => setEditing(row.original)} className="flex cursor-pointer flex-col text-start">
            <span className="font-medium text-foreground">{row.original.name}</span>
            {row.original.phone && <span className="text-muted-foreground">{row.original.phone}</span>}
          </button>
        ),
      },
      { accessorKey: 'id', header: m["clients.col.id"]() },
      { accessorKey: 'phone', header: m["clients.col.phone"](), cell: ({ row }) => row.original.phone ?? '·' },
      { accessorKey: 'address', header: m["clients.col.address"](), cell: ({ row }) => row.original.address ?? '·' },
      {
        accessorKey: 'custody',
        header: m["clients.col.custody"](),
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
      { accessorKey: 'matters', header: m["clients.col.matters"]() },
      { accessorKey: 'openMatters', header: m["clients.col.open"]() },
      { accessorKey: 'notes', header: m["clients.col.notes"](), cell: ({ row }) => <span className="inline-block max-w-xs truncate">{row.original.notes ?? '·'}</span> },
      { accessorKey: 'createdAt', header: m["clients.col.added"](), cell: ({ getValue }) => formatDay(getValue<number>()) },
    ],
    [],
  )

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.clients"]()}</h1>
          <p>{m["clients.lead"]()}</p>
        </div>
        <div className="page-actions">
          <PanelButton label={m["workspace.quick.add_client"]()} title={m["workspace.quick.add_client"]()} description={m["workspace.quick.add_client_about"]()} variant="default">
            {({ close, setDirty: report }) => <ClientForm onSuccess={close} onDirtyChange={report} />}
          </PanelButton>
        </div>
      </header>

      {clients.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={UserGroupIcon} />}>{m["clients.none"]()}</EmptyNote>
      ) : (
        <DataTable aria-label={m["nav.clients"]()} data={clients} columns={columns} getRowId={(row) => row.id} initialHidden={['id', 'phone', 'notes', 'createdAt']} emptyMessage={m["clients.no_match"]()} searchPlaceholder={m["clients.search"]()} />
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
        headings={{ title: m["clients.edit_title"](), description: m["clients.edit_description"]() }}
      >
        {editing && <ClientForm existing={editing} onDirtyChange={setDirty} onSuccess={() => setEditing(null)} />}
      </Createpanel>
    </article>
  )
}
