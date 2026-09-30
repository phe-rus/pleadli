import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { useMe } from '@/features/session'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { format } from '@/lib/date'
import { formatDistanceToNowStrict } from '@/lib/date'
import { useMemo, useState } from 'react'
import { RegisterStationForm } from './register-station-form'
import { useDecideRequest, useIssueActivationCode, usePendingRequests, useRevokeStation, useRoster, useStations } from './queries'
import { stationStateLabel, stationStateTone, type StationView } from './schema'

/** The stations under this command: register one, give it an activation code,
 * approve a connection, see what each reported, revoke one. Figures and
 * rosters only: a command never holds a station's records. */
export function StationsPage() {
  const { data: stations = [] } = useStations()
  const { data: requests = [] } = usePendingRequests()
  const { data: me } = useMe()
  const admin = me?.role === 'admin'
  const decide = useDecideRequest()
  const issue = useIssueActivationCode()
  const revoke = useRevokeStation()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [code, setCode] = useState<{ station: string; code: string; expiresAt: number } | null>(null)
  const [rosterOf, setRosterOf] = useState<StationView | null>(null)
  const nameOf = (id: string) => stations.find((s) => s.id === id)?.name ?? m["command.a_station"]()

  const columns: DataTableColumnDef<StationView>[] = useMemo(
    () => [
      selectColumn(),
      {
        accessorKey: 'id',
        header: m["common.id"](),
        cell: ({ row }) => <span className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs')}>{row.original.id}</span>,
      },
      { accessorKey: 'stationNumber', header: m["command.col_station_number"]() },
      { accessorKey: 'name', header: m["command.col_station"]() },
      { accessorKey: 'region', header: m["common.region"](), cell: ({ row }) => row.original.region ?? '·' },
      { accessorKey: 'district', header: m["common.district"](), cell: ({ row }) => row.original.district ?? '·' },
      {
        accessorKey: 'state',
        header: m["command.col_state"](),
        cell: ({ row }) => <Tag tone={stationStateTone(row.original.state)}>{stationStateLabel(row.original.state)}</Tag>,
      },
      { id: 'inCustody', header: m["common.in_custody"](), accessorFn: (r) => r.figures?.inCustody ?? '', cell: ({ row }) => row.original.figures?.inCustody ?? '·' },
      { id: 'nearLimit', header: m["common.near_the_limit"](), accessorFn: (r) => r.figures?.nearLimit ?? '', cell: ({ row }) => row.original.figures?.nearLimit ?? '·' },
      { id: 'pastLimit', header: m["common.past_the_limit"](), accessorFn: (r) => r.figures?.pastLimit ?? '', cell: ({ row }) => row.original.figures?.pastLimit ?? '·' },
      { id: 'openCases', header: m["common.open_cases"](), accessorFn: (r) => r.figures?.openCases ?? '', cell: ({ row }) => row.original.figures?.openCases ?? '·' },
      { id: 'referralsPending', header: m["command.referrals_pending"](), accessorFn: (r) => r.figures?.referralsPending ?? '', cell: ({ row }) => row.original.figures?.referralsPending ?? '·' },
      { id: 'onDuty', header: m["command.col_on_duty"](), accessorFn: (r) => r.figures?.onDutyNow ?? '', cell: ({ row }) => row.original.figures?.onDutyNow ?? '·' },
      { accessorKey: 'officers', header: m["common.officers"](), cell: ({ row }) => (row.original.reportedAt ? row.original.officers : '·') },
      { accessorKey: 'connectedAt', header: m["command.col_connected"](), cell: ({ row }) => (row.original.connectedAt ? format(row.original.connectedAt, 'PP p') : '·') },
      {
        accessorKey: 'lastReportAt',
        header: m["command.col_last_report"](),
        cell: ({ row }) => (row.original.lastReportAt ? m["common.ago"]({ time: formatDistanceToNowStrict(row.original.lastReportAt) }) : '·'),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const station = row.original
          if (station.state === 'revoked') return null
          return (
            <div className="flex items-center gap-1">
              {station.reportedAt && (
                <Button size="xs" variant="ghost" onClick={() => setRosterOf(station)}>
                  {m["command.roster"]()}
                </Button>
              )}
              {admin && (
                <>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        const issued = await issue.mutateAsync(station.id)
                        setCode({ station: station.name, ...issued })
                      } catch (error) {
                        t.error(m["command.issue_failed"](), { description: error instanceof Error ? error.message : undefined })
                      }
                    }}
                  >
                    {m["command.activation_code"]()}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm(m["command.revoke_confirm"]({ name: station.name }))) void revoke.mutateAsync(station.id)
                    }}
                  >
                    {m["common.revoke"]()}
                  </Button>
                </>
              )}
            </div>
          )
        },
      },
    ],
    [admin, issue, revoke],
  )

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["common.stations"]()}</h1>
          <p>{m["command.stations_lead"]()}</p>
        </div>
        {admin && (
          <div className="page-actions">
            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  {m["command.register_a_station"]()}
                </Button>
              }
              headings={{ title: m["command.register_a_station"](), description: m["command.register_description"]() }}
            >
              <RegisterStationForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
        )}
      </header>

      {requests.length > 0 && (
        <section aria-labelledby="requests" className="page-section">
          <div className="section-head">
            <h2 id="requests">{m["command.waiting_for_approval"]()}</h2>
            <Tag tone="open">{requests.length === 1 ? m["command.request_one"]() : m["command.request_count"]({ count: requests.length })}</Tag>
          </div>
          <RowList>
            {requests.map((request) => (
              <Row
                key={request.id}
                marker="open"
                title={nameOf(request.stationId)}
                summary={m["command.request_summary"]({ when: formatDistanceToNowStrict(request.createdAt, { addSuffix: true }), name: request.requestedByName, badge: request.requestedByBadge, from: request.requestedFrom || m["command.unknown_address"]() })}
                trailing={
                  admin ? (
                    <>
                      <Button size="sm" onClick={() => void decide.mutateAsync({ id: request.id, approve: true })}>
                        {m["common.approve"]()}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void decide.mutateAsync({ id: request.id, approve: false })}>
                        {m["common.reject"]()}
                      </Button>
                    </>
                  ) : (
                    <Tag tone="waiting">{m["command.admin_decides"]()}</Tag>
                  )
                }
              />
            ))}
          </RowList>
        </section>
      )}

      <DataTable aria-label={m["common.stations"]()} data={stations} columns={columns} getRowId={(row) => row.id} emptyMessage={m["command.empty_table"]()} searchPlaceholder={m["command.search_stations"]()} />

      <Dialog open={code !== null} onOpenChange={(open) => !open && setCode(null)}>
        <DialogContent>
          <DialogTitle>{m["command.code_title"]({ station: code?.station ?? '' })}</DialogTitle>
          <DialogDescription>
            {m["command.code_description"]({ expires: code ? format(code.expiresAt, 'PP p') : '' })}
          </DialogDescription>
          <p className="rounded-md bg-secondary px-4 py-3 text-center font-mono text-2xl tracking-widest">{code?.code}</p>
        </DialogContent>
      </Dialog>

      <RosterDialog station={rosterOf} onClose={() => setRosterOf(null)} />
    </article>
  )
}

function RosterDialog({ station, onClose }: { station: StationView | null; onClose: () => void }) {
  const { data: roster } = useRoster(station?.id ?? null)
  return (
    <Dialog open={station !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogTitle>{m["command.roster_title"]({ station: station?.name ?? '' })}</DialogTitle>
        <DialogDescription>{m["command.roster_description"]({ when: station?.reportedAt ? `, ${formatDistanceToNowStrict(station.reportedAt, { addSuffix: true })}` : '' })}</DialogDescription>
        {!roster || roster.length === 0 ? (
          <p className="text-muted-foreground">{m["command.no_officers_reported"]()}</p>
        ) : (
          <div role="list" className="flex max-h-96 flex-col divide-y divide-border/60 overflow-y-auto">
            {roster.map((officer, index) => (
              <div key={index} role="listitem" className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
                <span>
                  <strong>{[officer.rank, officer.name].filter(Boolean).join(' ')}</strong>
                  {officer.post ? `, ${officer.post}` : ''}
                </span>
                <span className="text-muted-foreground">
                  {officer.badgeNumber ? m["command.badge"]({ number: officer.badgeNumber }) : m["command.no_badge"]()}
                  {!officer.active ? m["command.left"]() : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
