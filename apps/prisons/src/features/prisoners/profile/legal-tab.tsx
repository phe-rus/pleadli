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

const dateOnly = (ms: number | null) => (ms == null ? 'Not computed' : format(ms, 'd MMM yyyy'))

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
        title="Legal authority"
        count={instruments.length}
        description="The warrants and orders this person is held under."
        action={
          <FormDrawer label="Record an instrument" title="Record an instrument" description="A warrant, order or other document that arrived for this person.">
            {(close, setDirty) => <InstrumentForm prisonerId={prisonerId} pending={pending} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={instruments}
          getKey={(i) => i.id}
          empty="No instruments recorded."
          columns={[
            {
              header: 'Instrument',
              cell: (i) => (
                <span className={i.status === 'superseded' ? 'text-muted-foreground line-through' : 'font-medium'}>
                  {instrumentKindLabel(i.kind)}
                </span>
              ),
            },
            { header: 'Reference', cell: (i) => i.reference ?? <Dash /> },
            { header: 'Issued by', cell: (i) => i.issuingAuthority ?? <Dash /> },
            { header: 'Received', cell: (i) => (i.receivedAt ? format(i.receivedAt, 'd MMM yyyy') : 'Not yet') },
            { header: 'Verified by', cell: (i) => i.verifiedBy ?? <Dash /> },
            {
              header: 'Status',
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
        title="Sentence"
        action={
          <FormDrawer
            key={sentence?.id ?? 'new'}
            label={sentence ? 'Correct the sentence' : 'Record the sentence'}
            add={false}
            title={sentence ? 'Correct the sentence' : 'Record the sentence'}
            description="From the warrant of conviction or committal."
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
                <Row label="Sentence" value={sentenceTermText(sentence)} />
                <Row label="Runs from" value={format(sentence.startsOn, 'd MMM yyyy')} />
                {!clocks.isLife && <Row label="Term ends" value={dateOnly(clocks.sentenceEndsOn)} />}
                {!clocks.isLife && <Row label="Remission (one third)" value={clocks.remissionDays != null ? `${clocks.remissionDays} days` : 'Not computed'} />}
                {!clocks.isLife && <Row label="Release due" value={dateOnly(clocks.releaseDueOn)} />}
                {clocks.paroleWindowOpensOn != null && <Row label="Parole window opens" value={dateOnly(clocks.paroleWindowOpensOn)} />}
                <p className="pt-1 text-xs text-muted-foreground">Dates are computed. Check them against the warrant.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No sentence recorded{prisoner.status === 'convicted' ? '. Record it to compute the entitlement date.' : '.'}
              </p>
            )}
          </CardContent>
        </Card>
      </ProfileSection>

      <ProfileSection
        title="Court production and remand"
        count={productions.length}
        action={
          <FormDrawer label="Record production" title="Record court production" description="Log a court-ordered production (s.67).">
            {(close, setDirty) => <CourtProductionForm prisonerId={prisonerId} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={productions}
          getKey={(p) => p.id}
          empty="No court productions recorded yet."
          columns={[
            { header: 'Date', cell: (p) => format(p.productionDate, 'd MMM yyyy p') },
            { header: 'Court reference', cell: (p) => p.courtReference ?? <Dash /> },
            { header: 'Method', cell: (p) => <Badge variant="secondary">{productionMethodLabel(p.productionMethod)}</Badge> },
            {
              header: 'Outcome',
              cell: (p) =>
                p.state === 'scheduled' ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Scheduled</Badge>
                    <Button size="xs" variant="secondary" onClick={() => setOutcomeFor(p.id)}>
                      Record outcome
                    </Button>
                  </div>
                ) : p.outcome ? (
                  <Badge>{courtOutcomeLabel(p.outcome)}</Badge>
                ) : (
                  <Dash />
                ),
            },
            { header: 'Next date', cell: (p) => (p.nextDate ? format(p.nextDate, 'd MMM yyyy') : <Dash />) },
            { header: 'Purpose', className: 'min-w-40', cell: (p) => (p.purpose ? <RichTextPreview value={p.purpose} className="text-muted-foreground" /> : <Dash />) },
          ]}
        />
      </ProfileSection>

      <ItemDrawer item={outcomeFor} onClose={() => setOutcomeFor(null)} title="Record the court outcome" description="What the court decided at this production.">
        {(id, close, setDirty) => <CourtOutcomeForm productionId={id} onSuccess={close} onDirtyChange={setDirty} />}
      </ItemDrawer>
    </div>
  )
}
