import { ObligationQueue } from '@/features/obligations'
import { stayEntryKinds, sentenceTermText, usePrisonerFile } from '@/features/custody'
import { useCourtProductionsForPrisoner } from '@/features/court-productions'
import { useHealthEventsForPrisoner } from '@/features/health-events'
import { useReleasesForPrisoner } from '@/features/releases'
import { useTransfersForPrisoner } from '@/features/transfers'
import { useVisitsForPrisoner } from '@/features/visits'
import { RichTextPreview } from '@pleadli/rich-text'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { format } from 'date-fns/format'
import type { ReactNode } from 'react'
import { ProfileSection } from './blocks'
import { buildTimeline } from './timeline'
import { m } from '@/paraglide/messages'

const dateOnly = (ms: number | null) => (ms == null ? m.prisoners_not_computed() : format(ms, 'd MMM yyyy'))

function Fact({ label, value, hint, warn }: { label: string; value: ReactNode; hint?: string; warn?: boolean }) {
  return (
    <Card className="min-w-44 flex-1 basis-44 p-0">
      <CardContent className="flex flex-col gap-1 py-3">
        <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</span>
        <span className={`text-base font-medium ${warn ? 'text-destructive' : ''}`}>{value}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

export function OverviewTab({ prisonerId, onOpenTab }: { prisonerId: string; onOpenTab: (tab: string) => void }) {
  const { data: file } = usePrisonerFile(prisonerId)
  const { data: productions } = useCourtProductionsForPrisoner(prisonerId)
  const { data: visits } = useVisitsForPrisoner(prisonerId)
  const { data: healthEvents } = useHealthEventsForPrisoner(prisonerId)
  const { data: transfers } = useTransfersForPrisoner(prisonerId)
  const { data: releases } = useReleasesForPrisoner(prisonerId)

  const { prisoner, clocks, sentence } = file
  const now = Date.now()
  const inCustody = prisoner.currentStatus === 'in_custody'
  const remand = prisoner.status === 'unconvicted'
  const openStay = file.stays.find((s) => s.exitedAt == null)
  const recent = buildTimeline({ stays: file.stays, productions, visits, healthEvents, transfers, releases }).slice(0, 6)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <Fact
          label={m.prisoners_next_court()}
          value={file.nextCourtAt ? format(file.nextCourtAt, 'd MMM yyyy p') : 'None scheduled'}
          hint={remand ? m.prisoners_remand_a_court_date_should_always() : undefined}
          warn={remand && inCustody && !file.nextCourtAt}
        />
        <Fact
          label={remand ? m.prisoners_mandatory_bail_threshold() : m.prisoners_entitlement_date()}
          value={dateOnly(remand ? clocks.mandatoryBailOn : clocks.releaseDueOn)}
          hint={
            remand
              ? prisoner.highCourtOnlyOffence
                ? m.prisoners_180_days_high_court_offence_art()
                : m.prisoners_60_days_art_23_6()
              : sentence
                ? m.prisoners_computed_with_one_third_remission_check()
                : m.prisoners_record_the_sentence_to_compute_it()
          }
        />
        <Fact
          label={m.prisoners_where()}
          value={prisoner.currentLocation ?? 'Not placed'}
          hint={
            openStay
              ? `${stayEntryKinds[openStay.entryKind as keyof typeof stayEntryKinds] ?? openStay.entryKind} ${format(openStay.enteredAt, 'd MMM yyyy')}`
              : undefined
          }
        />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <ProfileSection title={m.prisoners_open_for_this_person()} className="min-w-72 flex-1 basis-80">
          <ObligationQueue obligations={file.obligations} now={now} flat emptyMessage={m.prisoners_nothing_is_open_for_this_person()} />
        </ProfileSection>

        <ProfileSection
          title={m.prisoners_legal_position()}
          className="min-w-72 flex-1 basis-80"
          action={
            <Button size="xs" variant="ghost" onClick={() => onOpenTab('legal')}>
              {m.prisoners_open_legal()}
            </Button>
          }
        >
          <Card className="p-0">
            <CardContent className="flex flex-col gap-1.5 py-3">
              {sentence ? (
                <>
                  <Row label={m.prisoners_sentence()} value={sentenceTermText(sentence)} />
                  <Row label={m.prisoners_runs_from()} value={format(sentence.startsOn, 'd MMM yyyy')} />
                  {!clocks.isLife && <Row label={m.prisoners_term_ends()} value={dateOnly(clocks.sentenceEndsOn)} />}
                  {!clocks.isLife && <Row label={m.prisoners_release_due()} value={dateOnly(clocks.releaseDueOn)} />}
                  {clocks.paroleWindowOpensOn != null && <Row label={m.prisoners_parole_window_opens()} value={dateOnly(clocks.paroleWindowOpensOn)} />}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {prisoner.status === 'convicted' ? m.prisoners_no_sentence_recorded_convicted() : m.prisoners_no_sentence_recorded()}
                </p>
              )}
              <Row label={m.prisoners_instruments()} value={`${file.instruments.length}`} />
            </CardContent>
          </Card>
        </ProfileSection>
      </div>

      <ProfileSection title={m.prisoners_recent_activity()} description={m.prisoners_latest_events_on_this_file()}>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.prisoners_nothing_recorded_yet()}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
            {recent.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <Badge variant="outline" className="w-16 justify-center text-[10px]">
                  {entry.kind}
                </Badge>
                <span className="min-w-0 flex-1 truncate">
                  {entry.title}
                  {entry.detail && <span className="text-muted-foreground"> · {entry.detail}</span>}
                </span>
                <span className="text-xs text-muted-foreground">{format(entry.at, 'd MMM yyyy')}</span>
              </li>
            ))}
          </ul>
        )}
      </ProfileSection>

      {prisoner.notes && (
        <ProfileSection title={m.prisoners_notes()}>
          <RichTextPreview value={prisoner.notes} className="text-sm text-muted-foreground md:max-w-2xl" />
        </ProfileSection>
      )}
    </div>
  )
}
