import * as m from '@/paraglide/messages'
import { backupAlertsOptions, remoteAccessLogOptions, useBackupAlerts, useRemoteAccessLog } from '@/features/officers'
import { AlertCircleIcon, ListViewIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/logs/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...backupAlertsOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...remoteAccessLogOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { data: alerts } = useBackupAlerts()
  const { data: log } = useRemoteAccessLog()
  const activeCount = alerts.filter((a) => !a.acknowledged).length

  return (
    <article className="page">
      <section className="flex flex-col">
        <h1>{m["nav.logs"]()}</h1>
        <p className="md:max-w-lg">
          {m["logs.lead"]()}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:max-w-sm">
        <Link
          to="/logs/backup-alerts"
          className="flex flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:bg-muted/60"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={AlertCircleIcon} className="size-4" />
            <h3 className="text-sm">{m["logs.backup_title"]()}</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {activeCount > 0 ? m["logs.n_active"]({ count: activeCount }) : m["logs.n_recorded"]({ count: alerts.length })}
          </p>
        </Link>
        <Link
          to="/logs/remote-access"
          className="flex flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:bg-muted/60"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={ListViewIcon} className="size-4" />
            <h3 className="text-sm">{m["logs.remote_title"]()}</h3>
          </div>
          <p className="text-xs text-muted-foreground">{m["logs.n_recorded"]({ count: log.length })}</p>
        </Link>
      </section>
    </article>
  )
}
