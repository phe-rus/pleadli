import { AssistPanel } from '@/features/assist/assist-panel'
import * as m_ from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { Createpanel } from '@/components/create-panel'
import { Row, RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { describeAction, useAudit } from '@/features/audit'
import { DeadlinesSection } from '@/features/clocks'
import { FilingsSection } from '@/features/filings'
import { PapersSection } from '@/features/papers'
import { MoneySection } from '@/features/money'
import { custodyLabel } from '@/features/clients'
import { DocumentCreateForm, documentKindLabel } from '@/features/documents'
import { HearingActions, HearingForm, hearingStatusLabels, purposeLabel, reasonLabel, responsibleLabel, type Hearing } from '@/features/hearings'
import { inCourt, matterTypeLabel } from '@/features/matter-types'
import { CloseMatterForm, engagementLabel, levelLabel, MatterForm, matterOptions, PartiesSection, PleaForm, pleaStatusLabel, StageStepper, useMatter, useReopenMatter } from '@/features/matters'
import { durationText, NoteComposer, NoteRow, TimeForm, useRemoveTime } from '@/features/practice'
import { TaskForm, TaskRow } from '@/features/tasks'
import { ApiError, messageOf } from '@/lib/api'
import { plural } from '@/lib/present'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { useState } from 'react'

export const Route = createFileRoute('/_public/matters/$matterId')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.query({ ...matterOptions(params.matterId), staleTime: 'static' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound()
      throw error
    }
  },
  component: RouteComponent,
})

const openLink = 'text-primary'
const hearingTone = { scheduled: 'open', attended: 'done', adjourned: 'waiting', missed: 'urgent', cancelled: 'stopped' } as const

function hearingSummary(h: Hearing) {
  const bits: (string | null)[] = [h.courtroom]
  if (h.status === 'adjourned' && h.adjournReason) {
    bits.push(`${reasonLabel(h.adjournReason)}${h.adjournResponsible ? `, ${responsibleLabel(h.adjournResponsible).toLowerCase()}` : ''}`)
    bits.push(h.nextDate ? `Adjourned to ${format(h.nextDate, 'PP')}` : 'Date to be fixed')
    bits.push(h.outcome)
  } else {
    bits.push(h.outcome, h.note)
  }
  return bits.filter(Boolean).join('. ') || undefined
}

/** One matter, whole: the client, every hearing and why each adjourned, the tasks
 * that fall due, notes, documents, time, and your side of a plea negotiation.
 * Everything you do to a matter starts here. */
function RouteComponent() {
  const { matterId } = Route.useParams()
  const { data: detail } = useMatter(matterId)
  const { data: history } = useAudit(matterId, 30)
  const reopen = useReopenMatter()
  const removeTime = useRemoveTime()
  const navigate = useNavigate()
  const [closing, setClosing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const m = detail.matter
  const open = m.status === 'open'
  const listed = detail.hearings.filter((h) => h.status === 'scheduled').sort((a, b) => a.at - b.at)
  const openTasks = detail.tasks.filter((task) => task.doneAt == null)
  const minutes = detail.time.reduce((sum, e) => sum + e.minutes, 0)
  // What only criminal work has: custody, the offence, a plea negotiation.
  const criminal = m.matterType === 'criminal_defence'
  const court = inCourt(m.matterType)

  const facts: [string, string | null][] = [
    ['Client', detail.client.name],
    ['Kind of matter', matterTypeLabel(m.matterType)],
    ['Custody', criminal && detail.client.custody ? `${custodyLabel(detail.client.custody)}${detail.client.custodyPlace ? `, ${detail.client.custodyPlace}` : ''}` : null],
    ['Acting', `${engagementLabel(m.engagement)}${m.appointedOn ? `, appointed ${format(m.appointedOn, 'PP')}` : ''}`],
    ['Your reference', m.ourRef],
    ['Court', [m.courtName, m.courtLevel ? levelLabel(m.courtLevel) : null].filter(Boolean).join(', ') || null],
    ['Offence', m.offence],
    ['Next hearing', !court ? null : listed[0] ? `${format(listed[0].at, 'PPp')}, ${purposeLabel(listed[0].purpose).toLowerCase()}` : open ? 'None listed' : null],
    ['Outcome', m.outcome],
    ['Notes', m.notes],
  ]

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.courtNumber ?? m.title}</h1>
          <p>{m.courtNumber ? m.title : court ? 'No court number recorded' : matterTypeLabel(m.matterType)}</p>
        </div>
        <div className="page-actions">
          {open ? court && !listed.length ? <Tag tone="urgent">No hearing listed</Tag> : <Tag tone="open">Open</Tag> : <Tag tone="done">Closed</Tag>}
          <PanelButton label="Edit" title="Edit the matter" description="Correct the details, or how you came to act." variant="secondary" icon={false}>
            {({ close, setDirty: report }) => <MatterForm existing={m} onSuccess={close} onDirtyChange={report} />}
          </PanelButton>
          {open ? (
            <>
              {court && (
                <PanelButton label="List a hearing" title="List a hearing" description="Put a hearing in your diary.">
                  {({ close, setDirty: report }) => <HearingForm matterId={matterId} onSuccess={close} onDirtyChange={report} />}
                </PanelButton>
              )}
              <PanelButton label="Draft a document" title="Draft a document" description="Starts a draft. You write it in its own page.">
                {({ close, setDirty: report }) => (
                  <DocumentCreateForm
                    matterId={matterId}
                    onDirtyChange={report}
                    onSuccess={(document) => {
                      close()
                      void navigate({ to: '/documents/$documentId', params: { documentId: document.id } })
                    }}
                  />
                )}
              </PanelButton>
              <PanelButton label={m_["assist.settings.title"]()} title={m_["assist.panel.title"]()} description={m_["assist.panel.description"]()} variant="secondary" icon={false}>
                {() => <AssistPanel matterId={matterId} />}
              </PanelButton>
              <Button size="sm" variant="secondary" onClick={() => setClosing(true)}>
                Close
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => reopen.mutate(matterId, { onSuccess: () => t.success('Matter reopened'), onError: (error) => t.error('Could not reopen the matter', { description: messageOf(error) }) })}
            >
              Reopen
            </Button>
          )}
        </div>
      </header>

      <StageStepper matter={m} />

      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {facts
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-wrap">{value}</dd>
            </div>
          ))}
      </dl>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-8">
          {court && (
          <section aria-labelledby="hearings" className="page-section">
            <div className="section-head">
              <h2 id="hearings">Hearings</h2>
              {detail.hearings.length > 0 && <Tag tone="neutral">{plural(detail.hearings.length, 'hearing')}</Tag>}
            </div>
            {detail.hearings.length === 0 ? (
              <EmptyNote>No hearing has been listed for this matter.</EmptyNote>
            ) : (
              <RowList>
                {detail.hearings.map((h) => (
                  <Row
                    key={h.id}
                    aligned
                    marker={h.status === 'scheduled' ? 'open' : h.status === 'missed' ? 'urgent' : undefined}
                    title={`${format(h.at, 'PPp')}, ${purposeLabel(h.purpose).toLowerCase()}`}
                    summary={hearingSummary(h)}
                    trailing={
                      h.status === 'scheduled' ? (
                        <HearingActions hearing={h} matterId={matterId} />
                      ) : (
                        <Tag tone={hearingTone[h.status as keyof typeof hearingTone] ?? 'neutral'}>{hearingStatusLabels[h.status] ?? h.status}</Tag>
                      )
                    }
                  />
                ))}
              </RowList>
            )}
          </section>
          )}

          <DeadlinesSection matterId={matterId} open={open} clocks={detail.clocks} />

          <PartiesSection matter={m} parties={detail.parties} />

          <section aria-labelledby="notes" className="page-section">
            <div className="section-head">
              <h2 id="notes">Notes</h2>
            </div>
            {open && <NoteComposer matterId={matterId} />}
            {detail.notes.length === 0 ? (
              <EmptyNote>No note has been written on this matter.</EmptyNote>
            ) : (
              <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
                {detail.notes.map((note) => (
                  <NoteRow key={note.id} note={note} editable={open} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="documents" className="page-section">
            <h2 id="documents">Documents</h2>
            {detail.documents.length === 0 ? (
              <EmptyNote>No document has been drafted for this matter.</EmptyNote>
            ) : (
              <RowList>
                {detail.documents.map((d) => (
                  <Row
                    key={d.id}
                    aligned
                    title={
                      <Link to="/documents/$documentId" params={{ documentId: d.id }} className="text-foreground">
                        {d.reference ?? d.title}
                      </Link>
                    }
                    summary={`${documentKindLabel(d.kind)}${d.status === 'filed' && d.filedOn ? `, filed ${format(d.filedOn, 'PP')}` : ', draft'}.`}
                    trailing={
                      <>
                        {d.status === 'filed' ? <Tag tone="done">Filed</Tag> : <Tag tone="open">Draft</Tag>}
                        <Link to="/documents/$documentId" params={{ documentId: d.id }} className={openLink}>Open</Link>
                      </>
                    }
                  />
                ))}
              </RowList>
            )}
          </section>

          <PapersSection matterId={matterId} open={open} />
          <MoneySection matterId={matterId} clientId={m.clientId} engagement={m.engagement} open={open} />
          <FilingsSection matterId={matterId} matterTitle={m.courtNumber ? `${m.courtNumber}, ${m.title}` : m.title} court={m.courtName} open={open} filings={detail.filings} documents={detail.documents} />
        </div>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="tasks" className="page-section">
            <div className="section-head">
              <h2 id="tasks">Tasks</h2>
              {open && (
                <PanelButton label="Add" title="Add a task" description="Something to do on this matter." variant="ghost">
                  {({ close, setDirty: report }) => <TaskForm matterId={matterId} onSuccess={close} onDirtyChange={report} />}
                </PanelButton>
              )}
            </div>
            {detail.tasks.length === 0 ? (
              <EmptyNote>No task on this matter.</EmptyNote>
            ) : (
              <RowList>
                {[...openTasks, ...detail.tasks.filter((task) => task.doneAt != null)].map((task) => (
                  <TaskRow key={task.id} task={task} showMatter={false} />
                ))}
              </RowList>
            )}
          </section>

          {criminal && (
          <section aria-labelledby="plea" className="page-section">
            <div className="section-head">
              <h2 id="plea">Plea negotiation</h2>
              {open && (
                <PanelButton label={detail.plea ? 'Update' : 'Record'} title="Plea negotiation" description="Your side of a plea negotiation, and the steps it needs." variant="ghost" icon={false}>
                  {({ close, setDirty: report }) => <PleaForm matterId={matterId} existing={detail.plea} onSuccess={close} onDirtyChange={report} />}
                </PanelButton>
              )}
            </div>
            {!detail.plea ? (
              <EmptyNote>No plea negotiation is recorded. It is recorded only if one is being considered.</EmptyNote>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Tag tone={detail.plea.status === 'confirmed' ? 'done' : detail.plea.status === 'abandoned' ? 'stopped' : detail.plea.status === 'agreed' ? 'urgent' : 'open'}>{pleaStatusLabel(detail.plea.status)}</Tag>
                </div>
                {detail.plea.summary && <p className="whitespace-pre-wrap">{detail.plea.summary}</p>}
                {detail.plea.explainedOn && (
                  <p className="text-muted-foreground">
                    Explained to the accused on {format(detail.plea.explainedOn, 'PP')}
                    {detail.plea.explainedBy ? `, by ${detail.plea.explainedBy === 'advocate' ? 'the advocate' : 'a justice of the peace'}` : ''}.
                  </p>
                )}
                {detail.plea.signedOn && <p className="text-muted-foreground">Signed on {format(detail.plea.signedOn, 'PP')}.</p>}
                {detail.plea.confirmedOn && <p className="text-muted-foreground">Confirmed before the court on {format(detail.plea.confirmedOn, 'PP')}.</p>}
                {detail.plea.abandonedReason && <p className="text-muted-foreground">Abandoned: {detail.plea.abandonedReason}</p>}
              </div>
            )}
          </section>
          )}

          <section aria-labelledby="time" className="page-section">
            <div className="section-head">
              <h2 id="time">Time</h2>
              {open && (
                <PanelButton label="Record" title="Record time" description="Time you spent on this matter." variant="ghost" icon={false}>
                  {({ close, setDirty: report }) => <TimeForm matterId={matterId} onSuccess={close} onDirtyChange={report} />}
                </PanelButton>
              )}
            </div>
            {detail.time.length === 0 ? (
              <EmptyNote>No time has been recorded on this matter.</EmptyNote>
            ) : (
              <>
                <p className="text-muted-foreground">{durationText(minutes)} in all.</p>
                <RowList>
                  {detail.time.slice(0, 8).map((e) => (
                    <Row
                      key={e.id}
                      aligned
                      title={e.description}
                      summary={format(e.workedOn, 'd MMM yyyy')}
                      trailing={
                        <>
                          <Tag tone="neutral">{durationText(e.minutes)}</Tag>
                          {open && (
                            <Button size="sm" variant="ghost" onClick={() => removeTime.mutate(e.id, { onError: (error) => t.error('Could not remove it', { description: messageOf(error) }) })}>
                              Remove
                            </Button>
                          )}
                        </>
                      }
                    />
                  ))}
                </RowList>
              </>
            )}
          </section>

          <section aria-labelledby="history" className="page-section">
            <h2 id="history">History of this matter</h2>
            {!history || history.length === 0 ? (
              <EmptyNote>Nothing has been recorded yet.</EmptyNote>
            ) : (
              <RowList>
                {history.map((entry) => (
                  <Row key={entry.seq} title={describeAction(entry.action)} summary={`${formatDistanceToNowStrict(entry.at, { addSuffix: true })}${entry.actor ? `, ${entry.actor}` : ''}.`} />
                ))}
              </RowList>
            )}
          </section>
        </div>
      </div>

      <Createpanel
        open={closing}
        onOpenChange={(next) => {
          if (!next) {
            setClosing(false)
            setDirty(false)
          }
        }}
        isDirty={dirty}
        headings={{ title: 'Close the matter', description: 'Record how it ended. It can be reopened later.' }}
      >
        <CloseMatterForm matterId={matterId} onDirtyChange={setDirty} onSuccess={() => setClosing(false)} />
      </Createpanel>
    </article>
  )
}
