import { useCourtProductionsForPrisoner } from '@/features/court-productions'
import { stayEntryKinds, stayExitKinds, usePrisonerFile } from '@/features/custody'
import { useHealthEventsForPrisoner } from '@/features/health-events'
import { releaseTypeLabel, useReleasesForPrisoner } from '@/features/releases'
import { transferDirectionLabel, transferStateLabel, useTransfersForPrisoner } from '@/features/transfers'
import { useVisitsForPrisoner } from '@/features/visits'
import { RichTextPreview } from '@pleadli/rich-text'
import { Badge } from '@pleadli/ui/badge'
import { format } from 'date-fns/format'
import { Dash, ProfileSection, ProfileTable } from './blocks'
import { buildTimeline } from './timeline'
import { m } from '@/paraglide/messages'

export function HistoryTab({ prisonerId }: { prisonerId: string }) {
  const { data: file } = usePrisonerFile(prisonerId)
  const { data: productions } = useCourtProductionsForPrisoner(prisonerId)
  const { data: visits } = useVisitsForPrisoner(prisonerId)
  const { data: healthEvents } = useHealthEventsForPrisoner(prisonerId)
  const { data: transfers } = useTransfersForPrisoner(prisonerId)
  const { data: releases } = useReleasesForPrisoner(prisonerId)
  const timeline = buildTimeline({ stays: file.stays, productions, visits, healthEvents, transfers, releases })

  return (
    <div className="flex flex-col gap-8">
      <ProfileSection title={m.prisoners_stays()} count={file.stays.length} description={m.prisoners_each_time_this_facility_has_held()}>
        <ProfileTable
          rows={file.stays}
          getKey={(s) => s.id}
          empty={m.prisoners_no_stays_recorded()}
          columns={[
            { header: m.prisoners_entered(), cell: (s) => format(s.enteredAt, 'd MMM yyyy') },
            { header: m.prisoners_how(), cell: (s) => stayEntryKinds[s.entryKind as keyof typeof stayEntryKinds] ?? s.entryKind },
            { header: m.prisoners_left(), cell: (s) => (s.exitedAt ? format(s.exitedAt, 'd MMM yyyy') : <Badge variant="outline">{m.prisoners_current_stay()}</Badge>) },
            { header: m.prisoners_how(), cell: (s) => (s.exitKind ? (stayExitKinds[s.exitKind as keyof typeof stayExitKinds] ?? s.exitKind) : <Dash />) },
          ]}
        />
      </ProfileSection>

      <ProfileSection title={m.prisoners_transfers()} count={transfers.length}>
        <ProfileTable
          rows={transfers}
          getKey={(t) => t.id}
          empty={m.prisoners_no_transfers_recorded_yet()}
          columns={[
            { header: m.prisoners_direction(), cell: (t) => <Badge variant="outline">{transferDirectionLabel(t.direction)}</Badge> },
            { header: m.prisoners_state(), cell: (t) => <Badge variant="secondary">{transferStateLabel(t.direction, t.state)}</Badge> },
            { header: m.prisoners_date(), cell: (t) => format(t.transferredAt, 'd MMM yyyy') },
            { header: m.prisoners_other_prison(), cell: (t) => t.otherPrisonName ?? <Dash /> },
            { header: m.prisoners_ordered_by(), cell: (t) => t.orderingAuthority ?? <Dash /> },
            { header: m.prisoners_notes(), className: 'min-w-40', cell: (t) => (t.notes ? <RichTextPreview value={t.notes} className="text-muted-foreground" /> : <Dash />) },
          ]}
        />
      </ProfileSection>

      <ProfileSection title={m.prisoners_releases()} count={releases.length}>
        <ProfileTable
          rows={releases}
          getKey={(r) => r.id}
          empty={m.prisoners_no_releases_recorded_yet()}
          columns={[
            { header: m.prisoners_type(), cell: (r) => <Badge>{releaseTypeLabel(r.releaseType)}</Badge> },
            { header: m.prisoners_when(), cell: (r) => format(r.releasedAt, 'd MMM yyyy p') },
            { header: m.prisoners_ordered_by(), cell: (r) => r.orderedBy ?? <Dash /> },
            {
              header: m.prisoners_flags(),
              cell: (r) => (
                <div className="flex flex-wrap gap-1">
                  {r.exceptionReason && <Badge variant="destructive">{m.prisoners_excepted_discharge()}</Badge>}
                  {r.afterNoon && <Badge variant="outline">{m.prisoners_after_noon()}</Badge>}
                  {!r.exceptionReason && !r.afterNoon && <Dash />}
                </div>
              ),
            },
            { header: m.prisoners_notes(), className: 'min-w-40', cell: (r) => (r.notes ? <RichTextPreview value={r.notes} className="text-muted-foreground" /> : <Dash />) },
          ]}
        />
      </ProfileSection>

      <ProfileSection title={m.prisoners_timeline()} count={timeline.length} description={m.prisoners_everything_on_this_file_newest_first()}>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.prisoners_nothing_recorded_yet()}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
            {timeline.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">{format(entry.at, 'd MMM yyyy')}</span>
                <Badge variant="outline" className="w-16 justify-center text-[10px]">
                  {entry.kind}
                </Badge>
                <span className="min-w-0 flex-1 truncate">
                  {entry.title}
                  {entry.detail && <span className="text-muted-foreground"> · {entry.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </ProfileSection>
    </div>
  )
}
