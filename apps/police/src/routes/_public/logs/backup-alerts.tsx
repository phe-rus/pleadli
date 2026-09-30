import * as m from '@/paraglide/messages'
import {
  backupAlertMapUrl,
  backupAlertsOptions,
  backupAlertStatus,
  useBackupAlerts,
  useEndBackupAlert,
  type BackupAlert,
} from '@/features/officers'
import { LocationShare01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useMemo } from 'react'

// Message functions, called when drawn, so the words follow the language.
const statusLabel = { active: m["logs.active"], responding: m["logs.responding"], ended: m["logs.ended"] } as const
const statusVariant = { active: 'destructive', responding: 'default', ended: 'secondary' } as const

export const Route = createFileRoute('/_public/logs/backup-alerts')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...backupAlertsOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { data: alerts } = useBackupAlerts()
  const end = useEndBackupAlert()
  const activeCount = alerts.filter((a) => a.endedAt == null).length

  const handleEnd = async (id: string) => {
    try {
      await end.mutateAsync(id)
    } catch {
      t.error(m["backup.end_failed"](), { description: m["common.try_again"]() })
    }
  }

  const columns: DataTableColumnDef<BackupAlert>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: m["col.id"](),
        cell: ({ row }) => <span className="rounded-md bg-primary/15 px-3 py-1 text-xs">{row.original.id}</span>,
      },
      { accessorKey: 'officerId', header: m["col.officer_id"]() },
      { accessorKey: 'officerName', header: m["col.officer"]() },
      { accessorKey: 'latitude', header: m["col.latitude"](), cell: ({ row }) => row.original.latitude ?? '·' },
      { accessorKey: 'longitude', header: m["col.longitude"](), cell: ({ row }) => row.original.longitude ?? '·' },
      {
        id: 'location',
        header: m["col.map"](),
        cell: ({ row }) => {
          const url = backupAlertMapUrl(row.original)
          if (!url) return '·'
          return (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ size: 'xs', variant: 'secondary' }))}
            >
              <HugeiconsIcon icon={LocationShare01Icon} />
              {m["logs.view_on_map"]()}
            </a>
          )
        },
      },
      {
        id: 'status',
        header: m["col.status"](),
        cell: ({ row }) => {
          const status = backupAlertStatus(row.original)
          return <Badge variant={statusVariant[status]}>{statusLabel[status]()}</Badge>
        },
      },
      {
        id: 'responder',
        header: m["col.responder"](),
        cell: ({ row }) => row.original.responderName ?? '·',
      },
      {
        accessorKey: 'createdAt',
        header: m["col.requested"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.endedAt != null ? null : (
            <Button size="xs" variant="destructive" onClick={() => handleEnd(row.original.id)} disabled={end.isPending}>
              {m["backup.end"]()}
            </Button>
          ),
      },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end.isPending])

  return (
    <article className="page">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <h1>{m["logs.backup_title"]()}</h1>
          <p className="md:max-w-lg">
            {m["logs.backup_lead"]()}
          </p>
        </div>
        <Badge variant={activeCount > 0 ? 'destructive' : 'secondary'}>
          {activeCount > 0 ? m["logs.n_active"]({ count: activeCount }) : m["overview.none_active"]()}
        </Badge>
      </section>

      <DataTable
        aria-label={m["logs.backup_table"]()}
        data={alerts}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["logs.backup_empty"]()}
        searchPlaceholder={m["logs.search_officer"]()}
      />
    </article>
  )
}
