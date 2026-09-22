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
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
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
  const nameOf = (id: string) => stations.find((s) => s.id === id)?.name ?? 'A station'

  const columns: DataTableColumnDef<StationView>[] = useMemo(
    () => [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => <span className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs')}>{row.original.id}</span>,
      },
      { accessorKey: 'stationNumber', header: 'Station number' },
      { accessorKey: 'name', header: 'Station' },
      { accessorKey: 'region', header: 'Region', cell: ({ row }) => row.original.region ?? '·' },
      { accessorKey: 'district', header: 'District', cell: ({ row }) => row.original.district ?? '·' },
      {
        accessorKey: 'state',
        header: 'State',
        cell: ({ row }) => <Tag tone={stationStateTone(row.original.state)}>{stationStateLabel(row.original.state)}</Tag>,
      },
      { id: 'inCustody', header: 'In custody', accessorFn: (r) => r.figures?.inCustody ?? '', cell: ({ row }) => row.original.figures?.inCustody ?? '·' },
      { id: 'nearLimit', header: 'Near the limit', accessorFn: (r) => r.figures?.nearLimit ?? '', cell: ({ row }) => row.original.figures?.nearLimit ?? '·' },
      { id: 'pastLimit', header: 'Past the limit', accessorFn: (r) => r.figures?.pastLimit ?? '', cell: ({ row }) => row.original.figures?.pastLimit ?? '·' },
      { id: 'openCases', header: 'Open cases', accessorFn: (r) => r.figures?.openCases ?? '', cell: ({ row }) => row.original.figures?.openCases ?? '·' },
      { id: 'referralsPending', header: 'Referrals without an outcome', accessorFn: (r) => r.figures?.referralsPending ?? '', cell: ({ row }) => row.original.figures?.referralsPending ?? '·' },
      { id: 'onDuty', header: 'On duty now', accessorFn: (r) => r.figures?.onDutyNow ?? '', cell: ({ row }) => row.original.figures?.onDutyNow ?? '·' },
      { accessorKey: 'officers', header: 'Officers', cell: ({ row }) => (row.original.reportedAt ? row.original.officers : '·') },
      { accessorKey: 'connectedAt', header: 'Connected', cell: ({ row }) => (row.original.connectedAt ? format(row.original.connectedAt, 'PP p') : '·') },
      {
        accessorKey: 'lastReportAt',
        header: 'Last report',
        cell: ({ row }) => (row.original.lastReportAt ? `${formatDistanceToNowStrict(row.original.lastReportAt)} ago` : '·'),
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
                  Roster
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
                        t.error('Could not issue a code', { description: error instanceof Error ? error.message : undefined })
                      }
                    }}
                  >
                    Activation code
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm(`Revoke ${station.name}? It will stop being accepted and must connect again.`)) void revoke.mutateAsync(station.id)
                    }}
                  >
                    Revoke
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
          <h1>Stations</h1>
          <p>The stations under this command and what each last reported. A station sends figures and its roster; this command never holds its records.</p>
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
                  Register a station
                </Button>
              }
              headings={{ title: 'Register a station', description: 'Give a station a number so it can connect to this command.' }}
            >
              <RegisterStationForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
        )}
      </header>

      {requests.length > 0 && (
        <section aria-labelledby="requests" className="page-section">
          <div className="section-head">
            <h2 id="requests">Waiting for approval</h2>
            <Tag tone="open">{requests.length === 1 ? '1 request' : `${requests.length} requests`}</Tag>
          </div>
          <RowList>
            {requests.map((request) => (
              <Row
                key={request.id}
                marker="open"
                title={nameOf(request.stationId)}
                summary={`Asked to connect ${formatDistanceToNowStrict(request.createdAt, { addSuffix: true })} by ${request.requestedByName}, badge ${request.requestedByBadge}, from ${request.requestedFrom || 'an unknown address'}. Approve it only if that is someone you expect.`}
                trailing={
                  admin ? (
                    <>
                      <Button size="sm" onClick={() => void decide.mutateAsync({ id: request.id, approve: true })}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void decide.mutateAsync({ id: request.id, approve: false })}>
                        Reject
                      </Button>
                    </>
                  ) : (
                    <Tag tone="waiting">An administrator decides</Tag>
                  )
                }
              />
            ))}
          </RowList>
        </section>
      )}

      <DataTable aria-label="Stations" data={stations} columns={columns} getRowId={(row) => row.id} emptyMessage="No stations are registered yet." searchPlaceholder="Search stations" />

      <Dialog open={code !== null} onOpenChange={(open) => !open && setCode(null)}>
        <DialogContent>
          <DialogTitle>Activation code for {code?.station}</DialogTitle>
          <DialogDescription>
            Give this to the station's administrator. It connects the station without waiting for approval, works once, and expires {code ? format(code.expiresAt, 'PP p') : ''}. It is shown only now.
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
        <DialogTitle>{station?.name}, officers</DialogTitle>
        <DialogDescription>As the station last reported them{station?.reportedAt ? `, ${formatDistanceToNowStrict(station.reportedAt, { addSuffix: true })}` : ''}. Names and posts only.</DialogDescription>
        {!roster || roster.length === 0 ? (
          <p className="text-muted-foreground">No officers were reported.</p>
        ) : (
          <div role="list" className="flex max-h-96 flex-col divide-y divide-border/60 overflow-y-auto">
            {roster.map((officer, index) => (
              <div key={index} role="listitem" className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
                <span>
                  <strong>{[officer.rank, officer.name].filter(Boolean).join(' ')}</strong>
                  {officer.post ? `, ${officer.post}` : ''}
                </span>
                <span className="text-muted-foreground">
                  {officer.badgeNumber ? `Badge ${officer.badgeNumber}` : 'No badge'}
                  {!officer.active ? ', left' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
