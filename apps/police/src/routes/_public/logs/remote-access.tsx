import * as m from '@/paraglide/messages'
import {
  remoteAccessLogOptions,
  useRemoteAccessLog,
  type RemoteAccessLogEntry,
} from '@/features/officers'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { createFileRoute } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useMemo } from 'react'

/** The words for an action the phone app logged. An action this build does
 * not know is shown as the phone app sent it. */
function remoteActionLabel(action: string) {
  const label = (
    {
      search: m["logs.action.search"],
      custody_alerts: m["logs.action.custody_alerts"],
      view_detail: m["logs.action.view_detail"],
      backup_alert: m["logs.action.backup_alert"],
      check_in: m["logs.action.check_in"],
    } as Record<string, (() => string) | undefined>
  )[action]
  return label ? label() : action.replace(/_/g, ' ')
}

export const Route = createFileRoute('/_public/logs/remote-access')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...remoteAccessLogOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { data: log } = useRemoteAccessLog()
  const last = log[0]

  const columns: DataTableColumnDef<RemoteAccessLogEntry>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: m["col.id"](),
        cell: ({ row }) => <span className="rounded-md bg-primary/15 px-3 py-1 text-xs">{row.original.id}</span>,
      },
      { accessorKey: 'officerId', header: m["col.officer_id"]() },
      { accessorKey: 'officerName', header: m["col.officer"]() },
      {
        accessorKey: 'action',
        header: m["col.action"](),
        cell: ({ row }) => <Badge variant="secondary">{remoteActionLabel(row.original.action)}</Badge>,
      },
      { accessorKey: 'detail', header: m["col.detail"](), cell: ({ row }) => row.original.detail ?? '·' },
      {
        accessorKey: 'occurredAt',
        header: m["col.when"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="page">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <h1>{m["logs.remote_title"]()}</h1>
          <p className="md:max-w-lg">
            {m["logs.remote_lead"]()}
          </p>
        </div>
        <Badge variant="secondary">{last ? m["logs.total_last"]({ count: log.length, date: format(last.occurredAt, 'PP') }) : m["logs.total"]({ count: log.length })}</Badge>
      </section>

      <DataTable
        aria-label={m["logs.remote_table"]()}
        data={log}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["logs.remote_empty"]()}
        searchPlaceholder={m["logs.search_officer_action"]()}
      />
    </article>
  )
}
