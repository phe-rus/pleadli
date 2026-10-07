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
import { DocumentCreateForm, MatterPapers } from '@/features/documents'
import { setAssistOpen } from '@/features/assist/dock'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Segmented } from '@pleadli/ui/segmented'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { HearingActions, HearingForm, hearingStatusLabels, purposeLabel, reasonLabel, responsibleLabel, type Hearing } from '@/features/hearings'
import { inCourt, matterTypeLabel } from '@/features/matter-types'
import { CloseMatterForm, engagementLabel, levelLabel, MatterForm, matterOptions, PartiesSection, PleaForm, pleaStatusLabel, StageStepper, useMatter, useReopenMatter } from '@/features/matters'
import { durationText, NoteComposer, NoteRow, TimeForm, useRemoveTime } from '@/features/practice'
import { TaskForm, TaskRow } from '@/features/tasks'
import { ApiError, messageOf } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { useState } from 'react'

const matterTabs = ['matter', 'papers', 'notes', 'money', 'activity'] as const
type MatterTab = (typeof matterTabs)[number]

export const Route = createFileRoute('/_public/matters/$matterId')({
  validateSearch: (search: Record<string, unknown>): { tab?: MatterTab } => (matterTabs.includes(search.tab as MatterTab) ? { tab: search.tab as MatterTab } : {}),
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

const hearingTone = { scheduled: 'open', attended: 'done', adjourned: 'waiting', missed: 'urgent', cancelled: 'stopped' } as const

function hearingSummary(h: Hearing) {
  const bits: (string | null)[] = [h.courtroom]
  if (h.status === 'adjourned' && h.adjournReason) {
    bits.push(`${reasonLabel(h.adjournReason)}${h.adjournResponsible ? `, ${responsibleLabel(h.adjournResponsible).toLowerCase()}` : ''}`)
    bits.push(h.nextDate ? m_["mp.adjourned_to"]({ date: format(h.nextDate, 'PP') }) : m_["mp.date_to_fix"]())
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
  const tab = Route.useSearch().tab ?? 'matter'
  const [panel, setPanel] = useState<'edit' | 'document' | 'close' | null>(null)
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
    [m_["mp.fact.client"](), detail.client.name],
    [m_["mp.fact.kind"](), matterTypeLabel(m.matterType)],
    [m_["mp.fact.custody"](), criminal && detail.client.custody ? `${custodyLabel(detail.client.custody)}${detail.client.custodyPlace ? `, ${detail.client.custodyPlace}` : ''}` : null],
    [m_["mp.fact.acting"](), `${engagementLabel(m.engagement)}${m.appointedOn ? `, ${m_["mp.fact.appointed"]({ date: format(m.appointedOn, 'PP') })}` : ''}`],
    [m_["mp.fact.reference"](), m.ourRef],
    [m_["mp.fact.court"](), [m.courtName, m.courtLevel ? levelLabel(m.courtLevel) : null].filter(Boolean).join(', ') || null],
    [m_["mp.fact.offence"](), m.offence],
    [m_["mp.fact.next_hearing"](), !court ? null : listed[0] ? `${format(listed[0].at, 'PPp')}, ${purposeLabel(listed[0].purpose).toLowerCase()}` : open ? m_["mp.fact.none_listed"]() : null],
    [m_["mp.fact.outcome"](), m.outcome],
    [m_["mp.fact.notes"](), m.notes],
  ]

  const tabLabel: Record<MatterTab, string> = {
    matter: m_["mp.seg.matter"](),
    papers: m_["mp.seg.papers"](),
    notes: m_["mp.seg.notes"](),
    money: m_["mp.seg.money"](),
    activity: m_["mp.seg.activity"](),
  }
  const documentPanel = (close: () => void, report: (dirty: boolean) => void) => (
    <DocumentCreateForm
      matterId={matterId}
      onDirtyChange={report}
      onSuccess={(document) => {
        close()
        void navigate({ to: '/documents/$documentId', params: { documentId: document.id } })
      }}
    />
  )
  const closePanel = () => {
    setPanel(null)
    setDirty(false)
  }

  return (
    <article className="page">
      <header className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            {(m.courtNumber || m.ourRef) && <p className="text-[0.8125rem] text-muted-foreground">{[m.courtNumber, m.ourRef].filter(Boolean).join(' · ')}</p>}
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="tracking-tight">{m.title}</h1>
              {open ? court && !listed.length ? <Tag tone="urgent">{m_["mp.no_hearing_listed"]()}</Tag> : <Tag tone="open">{m_["mp.open"]()}</Tag> : <Tag tone="done">{m_["mp.closed"]()}</Tag>}
            </div>
            <p className="text-muted-foreground">
              {[
                detail.client.name,
                matterTypeLabel(m.matterType),
                criminal && detail.client.custody ? custodyLabel(detail.client.custody) : null,
                court ? (listed[0] ? `${format(listed[0].at, 'PPp')}, ${purposeLabel(listed[0].purpose).toLowerCase()}` : open ? m_["mp.fact.none_listed"]() : null) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PanelButton label={m_["mp.info"]()} title={m_["mp.info_title"]()} description={m_["mp.info_description"]()} variant="secondary" icon={false}>
              {() => (
                <Group>
                  {facts
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <GroupRow key={label} label={<span className="text-muted-foreground">{label}</span>} detail={<span className="whitespace-pre-wrap text-foreground">{value}</span>} />
                    ))}
                </Group>
              )}
            </PanelButton>
            {open && court && (
              <PanelButton label={m_["mp.list_hearing"]()} title={m_["mp.list_hearing"]()} description={m_["mp.list_hearing_description"]()} variant="default">
                {({ close, setDirty: report }) => <HearingForm matterId={matterId} onSuccess={close} onDirtyChange={report} />}
              </PanelButton>
            )}
            {open && !court && (
              <PanelButton label={m_["mp.draft_document"]()} title={m_["mp.draft_document"]()} description={m_["mp.draft_document_description"]()} variant="default">
                {({ close, setDirty: report }) => documentPanel(close, report)}
              </PanelButton>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="icon-sm" variant="ghost" aria-label={m_["mp.more"]()} title={m_["mp.more"]()} className="cursor-pointer">
                    <HugeiconsIcon icon={MoreHorizontalIcon} />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setPanel('edit')}>{m_["mp.edit"]()}</DropdownMenuItem>
                {open && court && <DropdownMenuItem onClick={() => setPanel('document')}>{m_["mp.draft_document"]()}</DropdownMenuItem>}
                <DropdownMenuItem onClick={() => setAssistOpen(true)}>{m_["nav.assist"]()}</DropdownMenuItem>
                <DropdownMenuSeparator />
                {open ? (
                  <DropdownMenuItem onClick={() => setPanel('close')}>{m_["mp.close"]()}</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => reopen.mutate(matterId, { onSuccess: () => t.success(m_["mp.reopened"]()), onError: (error) => t.error(m_["mp.reopen_failed"](), { description: messageOf(error) }) })}
                  >
                    {m_["mp.reopen"]()}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* One matter, five ways of looking at it, chosen like a Mac's segmented control. */}
        <div className="flex justify-center">
          <Segmented
            label={m_["mp.sections"]()}
            value={tab}
            items={matterTabs.map((id) => ({ value: id, label: tabLabel[id] }))}
            render={(item, props) => (
              <Link key={item.value} to="/matters/$matterId" params={{ matterId }} search={{ tab: item.value }} replace className={props.className} role={props.role} aria-selected={props['aria-selected']}>
                {props.children}
              </Link>
            )}
          />
        </div>
      </header>

      {tab === 'matter' && (
        <div className="flex flex-col gap-8">
          <StageStepper matter={m} />
          {court && (

          <section aria-labelledby="hearings" className="page-section">
            <div className="section-head">
              <h2 id="hearings">{m_["mp.hearings"]()}</h2>
              {detail.hearings.length > 0 && <Tag tone="neutral">{m_["mp.hearings_count"]({ count: String(detail.hearings.length) })}</Tag>}
            </div>
            {detail.hearings.length === 0 ? (
              <EmptyNote>{m_["mp.no_hearings"]()}</EmptyNote>
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
<section aria-labelledby="tasks" className="page-section">
            <div className="section-head">
              <h2 id="tasks">{m_["mp.tasks"]()}</h2>
              {open && (
                <PanelButton label={m_["mp.add"]()} title={m_["mp.add_task"]()} description={m_["mp.add_task_description"]()} variant="ghost">
                  {({ close, setDirty: report }) => <TaskForm matterId={matterId} onSuccess={close} onDirtyChange={report} />}
                </PanelButton>
              )}
            </div>
            {detail.tasks.length === 0 ? (
              <EmptyNote>{m_["mp.no_tasks"]()}</EmptyNote>
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
              <h2 id="plea">{m_["mp.plea"]()}</h2>
              {open && (
                <PanelButton label={detail.plea ? m_["mp.update"]() : m_["mp.record"]()} title={m_["mp.plea"]()} description={m_["mp.plea_description"]()} variant="ghost" icon={false}>
                  {({ close, setDirty: report }) => <PleaForm matterId={matterId} existing={detail.plea} onSuccess={close} onDirtyChange={report} />}
                </PanelButton>
              )}
            </div>
            {!detail.plea ? (
              <EmptyNote>{m_["mp.no_plea"]()}</EmptyNote>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Tag tone={detail.plea.status === 'confirmed' ? 'done' : detail.plea.status === 'abandoned' ? 'stopped' : detail.plea.status === 'agreed' ? 'urgent' : 'open'}>{pleaStatusLabel(detail.plea.status)}</Tag>
                </div>
                {detail.plea.summary && <p className="whitespace-pre-wrap">{detail.plea.summary}</p>}
                {detail.plea.explainedOn && (
                  <p className="text-muted-foreground">
                    {m_["mp.plea_explained"]({ date: format(detail.plea.explainedOn, 'PP') })}
                    {detail.plea.explainedBy ? `, ${detail.plea.explainedBy === 'advocate' ? m_["mp.plea_by_advocate"]() : m_["mp.plea_by_jp"]()}` : ''}.
                  </p>
                )}
                {detail.plea.signedOn && <p className="text-muted-foreground">{m_["mp.plea_signed"]({ date: format(detail.plea.signedOn, 'PP') })}</p>}
                {detail.plea.confirmedOn && <p className="text-muted-foreground">{m_["mp.plea_confirmed"]({ date: format(detail.plea.confirmedOn, 'PP') })}</p>}
                {detail.plea.abandonedReason && <p className="text-muted-foreground">{m_["mp.plea_abandoned"]({ reason: detail.plea.abandonedReason })}</p>}
              </div>
            )}
          </section>
          )}
          <PartiesSection matter={m} parties={detail.parties} />
        </div>
      )}

      {tab === 'papers' && (
        <div className="flex flex-col gap-8">
          <MatterPapers matterId={matterId} matterType={m.matterType} stage={m.stage} documents={detail.documents} open={open} matterTitle={m.courtNumber ? `${m.courtNumber}, ${m.title}` : m.title} clientName={detail.client.name} />
          <PapersSection matterId={matterId} open={open} />
          {court && <FilingsSection matterId={matterId} matterTitle={m.courtNumber ? `${m.courtNumber}, ${m.title}` : m.title} court={m.courtName} open={open} filings={detail.filings} documents={detail.documents} />}
        </div>
      )}

      {tab === 'notes' && (
<section aria-labelledby="notes" className="page-section">
            <div className="section-head">
              <h2 id="notes">{m_["mp.notes"]()}</h2>
            </div>
            {open && <NoteComposer matterId={matterId} />}
            {detail.notes.length === 0 ? (
              <EmptyNote>{m_["mp.no_notes"]()}</EmptyNote>
            ) : (
              <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
                {detail.notes.map((note) => (
                  <NoteRow key={note.id} note={note} editable={open} />
                ))}
              </div>
            )}
          </section>
      )}

      {tab === 'money' && (
        <div className="flex flex-col gap-8">
<MoneySection matterId={matterId} clientId={m.clientId} engagement={m.engagement} open={open} />
<section aria-labelledby="time" className="page-section">
            <div className="section-head">
              <h2 id="time">{m_["mp.time"]()}</h2>
              {open && (
                <PanelButton label={m_["mp.record"]()} title={m_["mp.record_time"]()} description={m_["mp.record_time_description"]()} variant="ghost" icon={false}>
                  {({ close, setDirty: report }) => <TimeForm matterId={matterId} onSuccess={close} onDirtyChange={report} />}
                </PanelButton>
              )}
            </div>
            {detail.time.length === 0 ? (
              <EmptyNote>{m_["mp.no_time"]()}</EmptyNote>
            ) : (
              <>
                <p className="text-muted-foreground">{m_["mp.time_total"]({ duration: durationText(minutes) })}</p>
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
                            <Button size="sm" variant="ghost" onClick={() => removeTime.mutate(e.id, { onError: (error) => t.error(m_["mp.remove_failed"](), { description: messageOf(error) }) })}>
                              {m_["mp.remove"]()}
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
        </div>
      )}

      {tab === 'activity' && (
<section aria-labelledby="history" className="page-section">
            <h2 id="history">{m_["mp.history"]()}</h2>
            {!history || history.length === 0 ? (
              <EmptyNote>{m_["mp.no_history"]()}</EmptyNote>
            ) : (
              <RowList>
                {history.map((entry) => (
                  <Row key={entry.seq} title={describeAction(entry.action)} summary={`${formatDistanceToNowStrict(entry.at, { addSuffix: true })}${entry.actor ? `, ${entry.actor}` : ''}.`} />
                ))}
              </RowList>
            )}
          </section>
      )}

      <Createpanel open={panel === 'close'} onOpenChange={(next) => !next && closePanel()} isDirty={dirty} headings={{ title: m_["mp.close_title"](), description: m_["mp.close_description"]() }}>
        <CloseMatterForm matterId={matterId} onDirtyChange={setDirty} onSuccess={closePanel} />
      </Createpanel>
      <Createpanel open={panel === 'edit'} onOpenChange={(next) => !next && closePanel()} isDirty={dirty} headings={{ title: m_["mp.edit_title"](), description: m_["mp.edit_description"]() }}>
        <MatterForm existing={m} onSuccess={closePanel} onDirtyChange={setDirty} />
      </Createpanel>
      <Createpanel open={panel === 'document'} onOpenChange={(next) => !next && closePanel()} isDirty={dirty} headings={{ title: m_["mp.draft_document"](), description: m_["mp.draft_document_description"]() }}>
        {documentPanel(closePanel, setDirty)}
      </Createpanel>
    </article>
  )
}
