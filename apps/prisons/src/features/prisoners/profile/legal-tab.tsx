import {
  CourtOutcomeForm,
  CourtProductionForm,
  courtOutcomeLabel,
  productionMethodLabel,
  useCourtProductionsForPrisoner,
} from '@/features/court-productions'
import {
  InstrumentForm,
  SentenceForm,
  instrumentKindLabel,
  instrumentStatusLabels,
  sentenceTermText,
  usePrisonerFile,
} from '@/features/custody'
import { RichTextPreview } from '@pleadli/rich-text'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { Dash, FormDrawer, ItemDrawer, ProfileSection, ProfileTable } from './blocks'
import { m } from '@/paraglide/messages'

const dateOnly = (ms: number | null) => (ms == null ? m.prisoners_not_computed() : format(ms, 'd MMM yyyy'))

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export function LegalTab({ prisonerId }: { prisonerId: string }) {
  const { data: file } = usePrisonerFile(prisonerId)
  const { data: productions } = useCourtProductionsForPrisoner(prisonerId)
  const [outcomeFor, setOutcomeFor] = useState<string | null>(null)
  const { prisoner, sentence, clocks, instruments } = file
  const pending = instruments.filter((i) => i.status === 'pending' || i.status === 'rectification_pending')

  return (
    <div className="flex flex-col gap-8">
      <ProfileSection
        title={m.prisoners_legal_authority()}
        count={instruments.length}
        description={m.prisoners_the_warrants_and_orders_this_person()}
        action={
          <FormDrawer label={m.prisoners_record_an_instrument()} title={m.prisoners_record_an_instrument()} description={m.prisoners_a_warrant_order_or_other_document()}>
            {(close, setDirty) => <InstrumentForm prisonerId={prisonerId} pending={pending} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={instruments}
          getKey={(i) => i.id}
          empty={m.prisoners_no_instruments_recorded()}
          columns={[
            {
              header: m.prisoners_instrument(),
              cell: (i) => (
                <span className={i.status === 'superseded' ? 'text-muted-foreground line-through' : 'font-medium'}>
                  {instrumentKindLabel(i.kind)}
                </span>
              ),
            },
            { header: m.prisoners_reference(), cell: (i) => i.reference ?? <Dash /> },
            { header: m.prisoners_issued_by(), cell: (i) => i.issuingAuthority ?? <Dash /> },
            { header: m.prisoners_received(), cell: (i) => (i.receivedAt ? format(i.receivedAt, 'd MMM yyyy') : m.prisoners_not_yet()) },
            { header: m.prisoners_verified_by(), cell: (i) => i.verifiedBy ?? <Dash /> },
            {
              header: m.prisoners_status(),
              cell: (i) => (
                <div className="flex flex-col gap-0.5">
                  <Badge variant={i.status === 'verified' ? 'outline' : i.status === 'superseded' ? 'secondary' : 'destructive'} className="w-fit">
                    {instrumentStatusLabels[i.status] ?? i.status}
                  </Badge>
                  {i.supersedeReason && <span className="text-xs text-muted-foreground">{i.supersedeReason}</span>}
                </div>
              ),
            },
          ]}
        />
      </ProfileSection>

      <ProfileSection
        title={m.prisoners_sentence()}
        action={
          <FormDrawer
            key={sentence?.id ?? 'new'}
            label={sentence ? m.prisoners_correct_the_sentence() : m.prisoners_record_the_sentence()}
            add={false}
            title={sentence ? m.prisoners_correct_the_sentence() : m.prisoners_record_the_sentence()}
            description={m.prisoners_from_the_warrant_of_conviction_or()}
          >
            {(close, setDirty) => (
              <SentenceForm
                key={sentence?.id ?? 'new'}
                prisonerId={prisonerId}
                current={sentence}
                instruments={instruments}
                onSuccess={close}
                onDirtyChange={setDirty}
              />
            )}
          </FormDrawer>
        }
      >
        <Card className="p-0 md:max-w-lg">
          <CardContent className="flex flex-col gap-1.5 py-3">
            {sentence ? (
              <>
                <Row label={m.prisoners_sentence()} value={sentenceTermText(sentence)} />
                <Row label={m.prisoners_runs_from()} value={format(sentence.startsOn, 'd MMM yyyy')} />
                {!clocks.isLife && <Row label={m.prisoners_term_ends()} value={dateOnly(clocks.sentenceEndsOn)} />}
                {!clocks.isLife && <Row label={m.prisoners_remission_one_third()} value={clocks.remissionDays != null ? `${clocks.remissionDays} days` : 'Not computed'} />}
                {!clocks.isLife && <Row label={m.prisoners_release_due()} value={dateOnly(clocks.releaseDueOn)} />}
                {clocks.paroleWindowOpensOn != null && <Row label={m.prisoners_parole_window_opens()} value={dateOnly(clocks.paroleWindowOpensOn)} />}
                <p className="pt-1 text-xs text-muted-foreground">{m.prisoners_dates_are_computed_check_them_against()}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {prisoner.status === 'convicted' ? m.prisoners_no_sentence_recorded_convicted() : m.prisoners_no_sentence_recorded()}
              </p>
            )}
          </CardContent>
        </Card>
      </ProfileSection>

      <ProfileSection
        title={m.prisoners_court_production_and_remand()}
        count={productions.length}
        action={
          <FormDrawer label={m.prisoners_record_production()} title={m.prisoners_record_court_production()} description={m.prisoners_log_a_court_ordered_production_s()}>
            {(close, setDirty) => <CourtProductionForm prisonerId={prisonerId} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={productions}
          getKey={(p) => p.id}
          empty={m.prisoners_no_court_productions_recorded_yet()}
          columns={[
            { header: m.prisoners_date(), cell: (p) => format(p.productionDate, 'd MMM yyyy p') },
            { header: m.prisoners_court_reference(), cell: (p) => p.courtReference ?? <Dash /> },
            { header: m.prisoners_method(), cell: (p) => <Badge variant="secondary">{productionMethodLabel(p.productionMethod)}</Badge> },
            {
              header: m.prisoners_outcome(),
              cell: (p) =>
                p.state === 'scheduled' ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{m.prisoners_scheduled()}</Badge>
                    <Button size="xs" variant="secondary" onClick={() => setOutcomeFor(p.id)}>
                      {m.prisoners_record_outcome()}
                    </Button>
                  </div>
                ) : p.outcome ? (
                  <Badge>{courtOutcomeLabel(p.outcome)}</Badge>
                ) : (
                  <Dash />
                ),
            },
            { header: m.prisoners_next_date(), cell: (p) => (p.nextDate ? format(p.nextDate, 'd MMM yyyy') : <Dash />) },
            { header: m.prisoners_purpose(), className: 'min-w-40', cell: (p) => (p.purpose ? <RichTextPreview value={p.purpose} className="text-muted-foreground" /> : <Dash />) },
          ]}
        />
      </ProfileSection>

      <ItemDrawer item={outcomeFor} onClose={() => setOutcomeFor(null)} title={m.prisoners_record_the_court_outcome()} description={m.prisoners_what_the_court_decided_at_this()}>
        {(id, close, setDirty) => <CourtOutcomeForm productionId={id} onSuccess={close} onDirtyChange={setDirty} />}
      </ItemDrawer>
    </div>
  )
}
