import { Createpanel } from '@/components/create-panel'
import { EmptyNote } from '@/components/planned'
import { ClientBooks, FeeNoteTag, feeNotesOptions, positionsOptions, ugx, type ClientPosition, type FeeNoteSummary } from '@/features/money'
import * as m from '@/paraglide/messages'
import { DataTable, type DataTableColumnDef } from '@pleadli/forms-tables'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { formatDay } from '@/lib/dates'
import { Invoice01Icon, Wallet01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Segmented } from '@pleadli/ui/segmented'
import { useMemo } from 'react'

type Search = { client?: string; show?: 'notes' }

export const Route = createFileRoute('/_public/money/')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search.client === 'string' ? { client: search.client } : {}),
    ...(search.show === 'notes' ? { show: 'notes' as const } : {}),
  }),
  component: RouteComponent,
})

/** The practice's books: what each client holds in the client account and
 * owes on fee notes, and every fee note. A client's own books open beside. */
function RouteComponent() {
  const { client, show } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: positions = [] } = useQuery(positionsOptions())
  const { data: notes = [] } = useQuery(feeNotesOptions())
  const chosen = positions.find((p) => p.clientId === client)

  const clientColumns: DataTableColumnDef<ClientPosition>[] = useMemo(
    () => [
      {
        accessorKey: 'clientName',
        header: m["money.col.client"](),
        cell: ({ row }) => (
          <Link to="/money" search={{ client: row.original.clientId }} className="font-medium text-foreground">
            {row.original.clientName}
          </Link>
        ),
      },
      { accessorKey: 'clientBalance', header: m["money.col.held"](), cell: ({ getValue }) => ugx(getValue<number>()) },
      { accessorKey: 'owed', header: m["money.col.owed"](), cell: ({ getValue }) => ugx(getValue<number>()) },
    ],
    [],
  )
  const noteColumns: DataTableColumnDef<FeeNoteSummary>[] = useMemo(
    () => [
      {
        accessorKey: 'number',
        header: m["money.col.number"](),
        cell: ({ row }) => (
          <Link to="/money/$feeNoteId" params={{ feeNoteId: row.original.id }} className="font-medium text-foreground">
            {row.original.number ?? m["money.status.draft"]()}
          </Link>
        ),
      },
      { accessorKey: 'clientName', header: m["money.col.client"]() },
      {
        id: 'matter',
        header: m["money.col.matter"](),
        accessorFn: (row) => `${row.courtNumber ?? ''} ${row.matterTitle}`,
        cell: ({ row }) => (
          <Link to="/matters/$matterId" params={{ matterId: row.original.matterId }} className="text-foreground">
            {row.original.courtNumber ?? row.original.matterTitle}
          </Link>
        ),
      },
      { accessorKey: 'status', header: m["money.col.status"](), cell: ({ row }) => <FeeNoteTag note={row.original} /> },
      { accessorKey: 'issuedOn', header: m["money.col.issued"](), cell: ({ row }) => (row.original.issuedOn ? formatDay(row.original.issuedOn) : '·') },
      { accessorKey: 'dueOn', header: m["money.col.due"](), cell: ({ row }) => (row.original.dueOn ? formatDay(row.original.dueOn) : '·') },
      { accessorKey: 'total', header: m["money.col.total"](), cell: ({ getValue }) => ugx(getValue<number>()) },
      { accessorKey: 'paid', header: m["money.col.paid"](), cell: ({ getValue }) => ugx(getValue<number>()) },
      { id: 'outstanding', header: m["money.col.outstanding"](), accessorFn: (row) => (row.status === 'issued' ? row.total - row.paid : 0), cell: ({ getValue }) => ugx(getValue<number>()) },
    ],
    [],
  )

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["money.title"]()}</h1>
          <p>{m["money.page_lead"]()}</p>
        </div>
      </header>

      <Segmented
        label={m["nav.money"]()}
        value={show ?? 'clients'}
        onChange={(v) => void navigate({ search: v === 'notes' ? { show: 'notes' } : {}, replace: true })}
        className="self-start"
        items={[
          { value: 'clients', label: m["money.clients_money"]() },
          { value: 'notes', label: m["money.fee_notes"](), count: notes.length || undefined },
        ]}
      />

      {show !== 'notes' ? (
        positions.length === 0 ? (
          <EmptyNote icon={<HugeiconsIcon icon={Wallet01Icon} />}>{m["money.no_positions"]()}</EmptyNote>
        ) : (
          <DataTable aria-label={m["money.clients_money"]()} data={positions} columns={clientColumns} getRowId={(row) => row.clientId} emptyMessage={m["money.no_positions"]()} searchPlaceholder={m["money.search_clients"]()} />
        )
      ) : (
        <>
          {notes.length === 0 ? (
            <EmptyNote icon={<HugeiconsIcon icon={Invoice01Icon} />}>{m["money.no_fee_notes_anywhere"]()}</EmptyNote>
          ) : (
            <DataTable aria-label={m["money.fee_notes"]()} data={notes} columns={noteColumns} getRowId={(row) => row.id} emptyMessage={m["money.no_fee_notes_anywhere"]()} searchPlaceholder={m["money.search_notes"]()} />
          )}
          <p className="text-muted-foreground">{m["money.not_tax_invoice"]()}</p>
        </>
      )}

      <Createpanel
        open={Boolean(client)}
        onOpenChange={(open) => !open && void navigate({ search: show ? { show } : {} })}
        headings={{ title: chosen?.clientName ?? m["money.client_books"](), description: m["money.books_description"]() }}
      >
        {client && <ClientBooks clientId={client} />}
      </Createpanel>
    </article>
  )
}
