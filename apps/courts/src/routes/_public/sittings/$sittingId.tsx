import { PanelButton } from '@/components/add-panel'
import { Row, RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { ExhibitRulingForm, exhibitStatusLabel, MarkExhibitForm, producerLabel, useRemoveExhibit, type Exhibit } from '@/features/exhibits'
import { RulingCreateForm } from '@/features/rulings'
import { purposeLabel, reasonLabel, responsibleLabel, SittingActions, sittingStatusLabels } from '@/features/sittings'
import { Appearances, NoteComposer, NoteRow, sittingOptions, useSignRecord, useSitting, custodyText } from '@/features/sitting-record'
import { RecordingSection } from '@/features/recordings'
import { messageOf } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { Createpanel } from '@/components/create-panel'
import { t } from '@pleadli/ui/goey-toaster'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { ApiError } from '@/lib/api'

export const Route = createFileRoute('/_public/sittings/$sittingId')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.query({ ...sittingOptions(params.sittingId), staleTime: 'static' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound()
      throw error
    }
  },
  component: RouteComponent,
})

const statusTone = { scheduled: 'open', held: 'done', adjourned: 'waiting', cancelled: 'stopped' } as const
const exhibitTone = { marked: 'open', admitted: 'done', rejected: 'stopped' } as const

function ExhibitRow({ exhibit, sittingId }: { exhibit: Exhibit; sittingId: string }) {
  const [ruling, setRuling] = useState(false)
  const [dirty, setDirty] = useState(false)
  const remove = useRemoveExhibit()
  return (
    <Row
      aligned
      title={`${exhibit.label}. ${exhibit.description}`}
      summary={[producerLabel(exhibit.producedBy), exhibit.witness ? `through ${exhibit.witness}` : null, exhibit.sittingId === sittingId ? 'marked at this sitting' : null, exhibit.note].filter(Boolean).join(', ')}
      trailing={
        <>
          <Tag tone={exhibitTone[exhibit.status as keyof typeof exhibitTone] ?? 'neutral'}>{exhibitStatusLabel(exhibit.status)}</Tag>
          <Button size="sm" variant="ghost" onClick={() => setRuling(true)}>
            Rule
          </Button>
          {exhibit.status === 'marked' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!window.confirm(`Take back the mark on ${exhibit.label}?`)) return
                remove.mutate(exhibit.id, { onError: (error) => t.error('Could not take the mark back', { description: messageOf(error) }) })
              }}
            >
              Remove
            </Button>
          )}
          <Createpanel
            open={ruling}
            onOpenChange={(open) => {
              if (!open) {
                setRuling(false)
                setDirty(false)
              }
            }}
            isDirty={dirty}
            headings={{ title: `Exhibit ${exhibit.label}`, description: 'Record what the court did with the exhibit.' }}
          >
            <ExhibitRulingForm exhibit={exhibit} onDirtyChange={setDirty} onSuccess={() => setRuling(false)} />
          </Createpanel>
        </>
      }
    />
  )
}

/** One sitting, as the bench works it. Before it: what happened last time and who
 * is in custody. During it: who appeared, notes stamped with the time, exhibits
 * marked and ruled on. After it: close it, and sign the record. The signed record
 * is the record of proceedings; it is frozen under a SHA-256 once signed. */
function RouteComponent() {
  const { sittingId } = Route.useParams()
  const { data: detail } = useSitting(sittingId)
  const navigate = useNavigate()
  const sign = useSignRecord()
  const { sitting, record } = detail
  const c = detail.case
  const closed = sitting.status === 'held' || sitting.status === 'adjourned'
  const signed = record.signedAt != null
  const editable = sitting.status !== 'cancelled' && !signed
  const partyById = new Map(detail.parties.map((p) => [p.id, p]))
  const notProduced = detail.appearances.some((a) => a.attendance === 'not_produced')
  const remanded = detail.parties.filter((p) => p.role === 'accused' && p.custody === 'remanded')

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>
            <Link to="/cases/$caseId" params={{ caseId: c.id }} className="text-foreground">
              {c.courtNumber}
            </Link>
          </h1>
          <p>
            {c.title}. {purposeLabel(sitting.purpose)}, {format(sitting.scheduledAt, 'PPp')}
            {sitting.courtroom ? `, ${sitting.courtroom}` : ''}.
          </p>
        </div>
        <div className="page-actions">
          <Tag tone={statusTone[sitting.status as keyof typeof statusTone] ?? 'neutral'}>{sittingStatusLabels[sitting.status] ?? sitting.status}</Tag>
          {sitting.status === 'scheduled' && <SittingActions sitting={sitting} caseId={c.id} adjournDefaults={notProduced ? { reason: 'prisoner_not_produced', responsible: 'prisons' } : undefined} />}
          {c.status === 'open' && (
            <PanelButton label="Draft a decision" title="Draft a ruling or judgment" description="Starts a draft from this sitting. You write it in its own page." variant="secondary">
              {({ close, setDirty }) => (
                <RulingCreateForm
                  caseId={c.id}
                  sittingId={sitting.id}
                  onDirtyChange={setDirty}
                  onSuccess={(ruling) => {
                    close()
                    void navigate({ to: '/rulings/$rulingId', params: { rulingId: ruling.id } })
                  }}
                />
              )}
            </PanelButton>
          )}
          {closed && !signed && (
            <Button
              size="sm"
              disabled={sign.isPending}
              onClick={() => {
                if (!window.confirm('Sign the record of this sitting? Its notes and appearances are frozen once signed.')) return
                sign.mutate(sittingId, { onSuccess: () => t.success('Record signed'), onError: (error) => t.error('The record cannot be signed yet', { description: messageOf(error) }) })
              }}
            >
              Sign the record
            </Button>
          )}
        </div>
      </header>

      {sitting.outcome && (
        <p>
          <strong>{sitting.status === 'held' ? 'Outcome' : 'Note'}.</strong> {sitting.outcome}
        </p>
      )}
      {detail.adjournment && (
        <p>
          <strong>Adjourned.</strong> {reasonLabel(detail.adjournment.reason)}, {responsibleLabel(detail.adjournment.responsible).toLowerCase()}.{' '}
          {detail.adjournment.nextDate ? `Next date ${format(detail.adjournment.nextDate, 'PP')}.` : 'The next date is still to be fixed.'}
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-8">
          <section aria-labelledby="notes" className="page-section">
            <div className="section-head">
              <h2 id="notes">Notes of the sitting</h2>
              {detail.notes.length > 0 && <Tag tone="neutral">{detail.notes.length === 1 ? '1 note' : `${detail.notes.length} notes`}</Tag>}
            </div>
            {editable && <NoteComposer sittingId={sittingId} />}
            {detail.notes.length === 0 ? (
              <EmptyNote>{sitting.status === 'cancelled' ? 'This sitting was cancelled, so it has no record.' : 'Nothing has been noted yet. Notes are stamped with the time they are written.'}</EmptyNote>
            ) : (
              <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
                {detail.notes.map((note) => (
                  <NoteRow key={note.id} note={note} editable={editable} />
                ))}
              </div>
            )}
          </section>

          <RecordingSection sittingId={sittingId} canRecord={sitting.status !== 'cancelled'} transcriptEditable={editable} />

          <section aria-labelledby="exhibits" className="page-section">
            <div className="section-head">
              <h2 id="exhibits">Exhibits in this case</h2>
              {c.status === 'open' && (
                <PanelButton label="Mark an exhibit" title="Mark an exhibit" description="Given the next label for the side that produces it." variant="ghost">
                  {({ close, setDirty }) => <MarkExhibitForm caseId={c.id} sittingId={sitting.id} onSuccess={close} onDirtyChange={setDirty} />}
                </PanelButton>
              )}
            </div>
            {detail.exhibits.length === 0 ? (
              <EmptyNote>No exhibit has been marked in this case.</EmptyNote>
            ) : (
              <RowList>
                {detail.exhibits.map((e) => (
                  <ExhibitRow key={e.id} exhibit={e} sittingId={sittingId} />
                ))}
              </RowList>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-8">
          <Appearances
            sittingId={sittingId}
            appearances={detail.appearances}
            editable={editable}
            custodyOf={(partyId) => {
              const party = partyId ? partyById.get(partyId) : undefined
              return party ? custodyText(party) : null
            }}
          />

          <section aria-labelledby="before" className="page-section">
            <h2 id="before">Before this sitting</h2>
            {remanded.length > 0 && (
              <RowList>
                {remanded.map((p) => (
                  <Row
                    key={p.id}
                    aligned
                    marker={p.remandUntil != null && p.remandUntil < sitting.scheduledAt ? 'urgent' : undefined}
                    title={p.name}
                    summary={`${custodyText(p)}.`}
                    trailing={<Tag tone="waiting">To be produced</Tag>}
                  />
                ))}
              </RowList>
            )}
            {detail.previous.length === 0 ? (
              <EmptyNote>This is the first sitting recorded for the case.</EmptyNote>
            ) : (
              <RowList>
                {detail.previous.map((s) => (
                  <Row
                    key={s.id}
                    aligned
                    title={
                      <Link to="/sittings/$sittingId" params={{ sittingId: s.id }} className="text-foreground">
                        {format(s.scheduledAt, 'PP')}, {purposeLabel(s.purpose).toLowerCase()}
                      </Link>
                    }
                    summary={
                      s.status === 'adjourned' && s.reason ? `Adjourned: ${reasonLabel(s.reason)}${s.responsible ? `, ${responsibleLabel(s.responsible).toLowerCase()}` : ''}.` : (s.outcome ?? sittingStatusLabels[s.status])
                    }
                  />
                ))}
              </RowList>
            )}
          </section>

          <section aria-labelledby="record" className="page-section">
            <h2 id="record">The record</h2>
            {signed ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {record.intact === false ? <Tag tone="urgent">Changed since signed</Tag> : <Tag tone="done">Signed, unchanged</Tag>}
                </div>
                <p>
                  Signed by {record.signedBy} on {record.signedAt ? format(record.signedAt, 'PPp') : '·'}.
                </p>
                <p className="break-all text-muted-foreground">SHA-256 {record.sha256}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                {closed
                  ? 'Unsigned. Check the notes and appearances, then sign. From then on they cannot be changed.'
                  : sitting.status === 'cancelled'
                    ? 'A cancelled sitting has no record.'
                    : 'Unsigned. Close the sitting as held or adjourned, then sign the record. The signed record, not any machine transcript, is the record of proceedings.'}
              </p>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
