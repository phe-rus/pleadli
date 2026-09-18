import { Createpanel } from '@/components/create-panel'
import { ObligationQueue } from '@/features/obligations'
import { custodyStatusLabel, prisonerStatusLabel } from '@/features/prisoners/schema'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState, type ReactNode } from 'react'
import { InstrumentForm } from './instrument-form'
import { usePrisonerFile } from './queries'
import { SentenceForm } from './sentence-form'
import { instrumentKindLabel, instrumentStatusLabels, sentenceTermText, stayEntryKinds, stayExitKinds } from './schema'

const dateOnly = (ms: number | null) => (ms == null ? 'Not computed' : format(ms, 'd MMM yyyy'))

type PrisonerFileHeaderProps = {
  prisonerId: string
  /** Page-level actions such as editing identity details. */
  actions?: ReactNode
}

/**
 * "What do I need to know about this person right now"
 * (docs/prisons/product-map/08 1.4): the state, the dates the law sets, what
 * is open for them, and the procedures that change it. The domain tabs below
 * it hold the depth.
 */
export function PrisonerFileHeader({ prisonerId, actions }: PrisonerFileHeaderProps) {
  const { data: file } = usePrisonerFile(prisonerId)
  const [instrumentOpen, setInstrumentOpen] = useState(false)
  const [instrumentDirty, setInstrumentDirty] = useState(false)
  const [sentenceOpen, setSentenceOpen] = useState(false)
  const [sentenceDirty, setSentenceDirty] = useState(false)

  const { prisoner, clocks, sentence, instruments } = file
  const now = Date.now()
  const inCustody = prisoner.currentStatus === 'in_custody'
  const pending = instruments.filter((i) => i.status === 'pending' || i.status === 'rectification_pending')
  const pastBail = inCustody && clocks.mandatoryBailOn != null && clocks.mandatoryBailOn <= now
  const inWindow = inCustody && clocks.paroleWindowOpensOn != null && clocks.paroleWindowOpensOn <= now && (clocks.releaseDueOn ?? 0) > now
  const openStay = file.stays.find((s) => s.exitedAt == null)

  return (
    <div className="flex flex-col gap-5">
      <section className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1>
              {prisoner.lastName}, {prisoner.firstName}
              {prisoner.otherNames ? ` ${prisoner.otherNames}` : ''}
            </h1>
            <Badge variant="secondary">{prisonerStatusLabel(prisoner.status)}</Badge>
            <Badge variant={inCustody ? 'outline' : 'secondary'}>{custodyStatusLabel(prisoner.currentStatus)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {prisoner.reference ?? 'No reference recorded'}
            {prisoner.nationalId ? ` · ${prisoner.nationalId}` : ''}
            {prisoner.offence ? ` · ${prisoner.offence}` : ''}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pending.length > 0 && <Badge variant="destructive">Documents pending</Badge>}
            {pastBail && <Badge variant="destructive">Past the mandatory-bail threshold</Badge>}
            {inWindow && <Badge variant="outline">Parole window open</Badge>}
            {clocks.reviewable && inCustody && <Badge variant="outline">s.88 review applies</Badge>}
            {prisoner.currentStatus === 'in_transit' && <Badge variant="outline">In transit to another prison</Badge>}
            {prisoner.currentStatus === 'transferred_out' && <Badge variant="secondary">Archived: transferred out</Badge>}
          </div>
        </div>
        {actions}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Admitted" value={format(prisoner.admittedAt, 'd MMM yyyy')} hint={inCustody ? `${clocks.daysHeld} days held` : undefined} />
        <Fact
          label="Next court"
          value={file.nextCourtAt ? format(file.nextCourtAt, 'd MMM yyyy p') : 'None scheduled'}
          hint={prisoner.status === 'unconvicted' ? 'Remand: a court date should always be booked' : undefined}
          warn={prisoner.status === 'unconvicted' && inCustody && !file.nextCourtAt}
        />
        <Fact
          label={prisoner.status === 'unconvicted' ? 'Mandatory-bail threshold' : 'Entitlement date'}
          value={dateOnly(prisoner.status === 'unconvicted' ? clocks.mandatoryBailOn : clocks.releaseDueOn)}
          hint={
            prisoner.status === 'unconvicted'
              ? prisoner.highCourtOnlyOffence
                ? '180 days, High Court offence (Art. 23(6))'
                : '60 days (Art. 23(6))'
              : sentence
                ? 'Computed with one-third remission. Check the warrant.'
                : 'Record the sentence to compute it'
          }
        />
        <Fact label="Where" value={prisoner.currentLocation ?? 'Not placed'} hint={openStay ? `${stayEntryKinds[openStay.entryKind as keyof typeof stayEntryKinds] ?? openStay.entryKind} ${format(openStay.enteredAt, 'd MMM yyyy')}` : undefined} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-medium">Open for this person</h2>
          <ObligationQueue obligations={file.obligations} now={now} flat emptyMessage="Nothing is open for this person." />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-medium">Procedures</h2>
          <div className="flex flex-wrap gap-2">
            {inCustody && (
              <>
                <Link to="/procedures/discharge/$prisonerId" params={{ prisonerId }} className={buttonVariants({ size: 'sm' })}>
                  Discharge
                </Link>
                <Link to="/procedures/transfer/$prisonerId" params={{ prisonerId }} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                  {file.openTransfer ? 'Continue transfer' : 'Transfer out'}
                </Link>
              </>
            )}
            {prisoner.currentStatus === 'in_transit' && (
              <Link to="/movements" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                Open movements
              </Link>
            )}
            <Button size="sm" variant="secondary" onClick={() => setInstrumentOpen(true)}>
              Record an instrument
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSentenceOpen(true)}>
              {sentence ? 'Correct the sentence' : 'Record the sentence'}
            </Button>
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-medium">Legal authority</h2>
          {instruments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No instruments recorded.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
              {instruments.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                  <div className="flex min-w-0 flex-col">
                    <span className={i.status === 'superseded' ? 'text-muted-foreground line-through' : 'font-medium'}>
                      {instrumentKindLabel(i.kind)}
                      {i.reference ? ` ${i.reference}` : ''}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[i.issuingAuthority, i.receivedAt ? `received ${format(i.receivedAt, 'd MMM yyyy')}` : null, i.verifiedBy ? `by ${i.verifiedBy}` : null]
                        .filter(Boolean)
                        .join(' · ') || 'Not yet received'}
                    </span>
                    {i.supersedeReason && <span className="text-xs text-muted-foreground">Superseded: {i.supersedeReason}</span>}
                  </div>
                  <Badge variant={i.status === 'verified' ? 'outline' : i.status === 'superseded' ? 'secondary' : 'destructive'} className="shrink-0 text-[10px]">
                    {instrumentStatusLabels[i.status] ?? i.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-medium">Sentence and stays</h2>
          <Card className="p-0">
            <CardContent className="flex flex-col gap-1.5 py-3 text-sm">
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
                <p className="text-muted-foreground">No sentence recorded{prisoner.status === 'convicted' ? '. Record it to compute the entitlement date.' : '.'}</p>
              )}
              <div className="mt-2 flex flex-col gap-1 border-t border-border/60 pt-2">
                {file.stays.map((s) => (
                  <span key={s.id} className="text-xs text-muted-foreground">
                    {stayEntryKinds[s.entryKind as keyof typeof stayEntryKinds] ?? s.entryKind} {format(s.enteredAt, 'd MMM yyyy')}
                    {s.exitedAt ? ` to ${stayExitKinds[s.exitKind as keyof typeof stayExitKinds] ?? s.exitKind} ${format(s.exitedAt, 'd MMM yyyy')}` : ' (current stay)'}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      <Createpanel
        open={instrumentOpen}
        onOpenChange={setInstrumentOpen}
        isDirty={instrumentDirty}
        headings={{ title: 'Record an instrument', description: 'A warrant, order or other document that arrived for this person.' }}
      >
        <InstrumentForm prisonerId={prisonerId} pending={pending} onSuccess={() => setInstrumentOpen(false)} onDirtyChange={setInstrumentDirty} />
      </Createpanel>

      <Createpanel
        open={sentenceOpen}
        onOpenChange={setSentenceOpen}
        isDirty={sentenceDirty}
        headings={{ title: sentence ? 'Correct the sentence' : 'Record the sentence', description: 'From the warrant of conviction or committal.' }}
      >
        <SentenceForm
          key={sentence?.id ?? 'new'}
          prisonerId={prisonerId}
          current={sentence}
          instruments={instruments}
          onSuccess={() => setSentenceOpen(false)}
          onDirtyChange={setSentenceDirty}
        />
      </Createpanel>
    </div>
  )
}

function Fact({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <Card className="p-0">
      <CardContent className="flex flex-col gap-1 py-3">
        <span className="text-xs tracking-wide text-muted-foreground uppercase">{label}</span>
        <span className={`text-base font-medium ${warn ? 'text-destructive' : ''}`}>{value}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
