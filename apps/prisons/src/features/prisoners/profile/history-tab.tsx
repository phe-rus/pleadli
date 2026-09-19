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
      <ProfileSection title="Stays" count={file.stays.length} description="Each time this facility has held this person.">
        <ProfileTable
          rows={file.stays}
          getKey={(s) => s.id}
          empty="No stays recorded."
          columns={[
            { header: 'Entered', cell: (s) => format(s.enteredAt, 'd MMM yyyy') },
            { header: 'How', cell: (s) => stayEntryKinds[s.entryKind as keyof typeof stayEntryKinds] ?? s.entryKind },
            { header: 'Left', cell: (s) => (s.exitedAt ? format(s.exitedAt, 'd MMM yyyy') : <Badge variant="outline">Current stay</Badge>) },
            { header: 'How', cell: (s) => (s.exitKind ? (stayExitKinds[s.exitKind as keyof typeof stayExitKinds] ?? s.exitKind) : <Dash />) },
          ]}
        />
      </ProfileSection>

      <ProfileSection title="Transfers" count={transfers.length}>
        <ProfileTable
          rows={transfers}
          getKey={(t) => t.id}
          empty="No transfers recorded yet."
          columns={[
            { header: 'Direction', cell: (t) => <Badge variant="outline">{transferDirectionLabel(t.direction)}</Badge> },
            { header: 'State', cell: (t) => <Badge variant="secondary">{transferStateLabel(t.direction, t.state)}</Badge> },
            { header: 'Date', cell: (t) => format(t.transferredAt, 'd MMM yyyy') },
            { header: 'Other prison', cell: (t) => t.otherPrisonName ?? <Dash /> },
            { header: 'Ordered by', cell: (t) => t.orderingAuthority ?? <Dash /> },
            { header: 'Notes', className: 'min-w-40', cell: (t) => (t.notes ? <RichTextPreview value={t.notes} className="text-muted-foreground" /> : <Dash />) },
          ]}
        />
      </ProfileSection>

      <ProfileSection title="Releases" count={releases.length}>
        <ProfileTable
          rows={releases}
          getKey={(r) => r.id}
          empty="No releases recorded yet."
          columns={[
            { header: 'Type', cell: (r) => <Badge>{releaseTypeLabel(r.releaseType)}</Badge> },
            { header: 'When', cell: (r) => format(r.releasedAt, 'd MMM yyyy p') },
            { header: 'Ordered by', cell: (r) => r.orderedBy ?? <Dash /> },
            {
              header: 'Flags',
              cell: (r) => (
                <div className="flex flex-wrap gap-1">
                  {r.exceptionReason && <Badge variant="destructive">Excepted discharge</Badge>}
                  {r.afterNoon && <Badge variant="outline">After noon</Badge>}
                  {!r.exceptionReason && !r.afterNoon && <Dash />}
                </div>
              ),
            },
            { header: 'Notes', className: 'min-w-40', cell: (r) => (r.notes ? <RichTextPreview value={r.notes} className="text-muted-foreground" /> : <Dash />) },
          ]}
        />
      </ProfileSection>

      <ProfileSection title="Timeline" count={timeline.length} description="Everything on this file, newest first.">
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
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
