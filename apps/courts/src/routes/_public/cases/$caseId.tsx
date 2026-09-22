import { PanelButton } from '@/components/add-panel'
import { Createpanel } from '@/components/create-panel'
import { RowList, Row } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { describeAction, useAudit } from '@/features/audit'
import {
  CaseForm,
  caseOptions,
  ConcludeForm,
  courtLevelLabel,
  custodyLabel,
  PartyForm,
  roleLabel,
  useCase,
  useReopenCase,
  useRemoveParty,
  type Party,
} from '@/features/cases'
import { ExhibitRulingForm, exhibitStatusLabel, MarkExhibitForm, producerLabel, type Exhibit } from '@/features/exhibits'
import { OrderForm, orderKindLabel } from '@/features/orders'
import { RulingCreateForm, rulingKindLabel } from '@/features/rulings'
import { purposeLabel, reasonLabel, responsibleLabel, SittingActions, SittingForm, sittingStatusLabels, type Adjournment, type Sitting } from '@/features/sittings'
import { messageOf } from '@/lib/api'
import { plural } from '@/lib/present'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { useState } from 'react'
import { ApiError } from '@/lib/api'

export const Route = createFileRoute('/_public/cases/$caseId')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.query({ ...caseOptions(params.caseId), staleTime: 'static' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound()
      throw error
    }
  },
  component: RouteComponent,
})

const openLink = 'text-primary'
const sittingTone = { scheduled: 'open', held: 'done', adjourned: 'waiting', cancelled: 'stopped' } as const

function custodySummary(p: Party) {
  if (p.role !== 'accused') return null
  if (!p.custody) return 'Custody not recorded'
  if (p.custody !== 'remanded') return custodyLabel(p.custody)
  const where = p.custodyPlace ? ` at ${p.custodyPlace}` : ''
  return p.remandUntil ? `Remanded${where} until ${format(p.remandUntil, 'PP')}` : `Remanded${where}, no end date recorded`
}

function PartyRow({ party, editable, caseId }: { party: Party; editable: boolean; caseId: string }) {
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const remove = useRemoveParty()
  const summary = custodySummary(party)
  const overdue = party.custody === 'remanded' && party.remandUntil != null && party.remandUntil < Date.now()

  return (
    <Row
      aligned
      marker={overdue ? 'urgent' : undefined}
      title={party.name}
      summary={[summary, party.note].filter(Boolean).join('. ') || undefined}
      trailing={
        <>
          <Tag tone={party.role === 'accused' ? 'neutral' : 'stopped'}>{roleLabel(party.role)}</Tag>
          {editable && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!window.confirm(`Remove ${party.name} from this case?`)) return
                  remove.mutate(party.id, { onError: (error) => t.error('Could not remove the person', { description: messageOf(error) }) })
                }}
              >
                Remove
              </Button>
            </>
          )}
          <Createpanel
            open={editing}
            onOpenChange={(open) => {
              if (!open) {
                setEditing(false)
                setDirty(false)
              }
            }}
            isDirty={dirty}
            headings={{ title: 'Edit person', description: 'Change who this is, or where they are held.' }}
          >
            <PartyForm caseId={caseId} existing={party} onDirtyChange={setDirty} onSuccess={() => setEditing(false)} />
          </Createpanel>
        </>
      }
    />
  )
}

function ExhibitLine({ exhibit }: { exhibit: Exhibit }) {
  const [ruling, setRuling] = useState(false)
  const [dirty, setDirty] = useState(false)
  const tone = { marked: 'open', admitted: 'done', rejected: 'stopped' } as const
  return (
    <Row
      aligned
      title={`${exhibit.label}. ${exhibit.description}`}
      summary={[producerLabel(exhibit.producedBy), exhibit.witness ? `through ${exhibit.witness}` : null, exhibit.note].filter(Boolean).join(', ')}
      trailing={
        <>
          <Tag tone={tone[exhibit.status as keyof typeof tone] ?? 'neutral'}>{exhibitStatusLabel(exhibit.status)}</Tag>
          <Button size="sm" variant="ghost" onClick={() => setRuling(true)}>
            Rule
          </Button>
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

function adjournmentLine(a: Adjournment | undefined) {
  if (!a) return null
  const next = a.nextDate ? `Adjourned to ${format(a.nextDate, 'PP')}` : 'Adjourned, date to be fixed'
  return `${next}. ${reasonLabel(a.reason)}, ${responsibleLabel(a.responsible).toLowerCase()}.${a.note ? ` ${a.note}` : ''}`
}

/** One case, whole: who is in it, every sitting and why each adjourned, the
 * orders made, and its own history. Everything the bench does to a case starts
 * here. */
function RouteComponent() {
  const { caseId } = Route.useParams()
  const { data: detail } = useCase(caseId)
  const { data: history } = useAudit(caseId, 30)
  const reopen = useReopenCase()
  const navigate = useNavigate()
  const [conclude, setConclude] = useState(false)
  const [dirty, setDirty] = useState(false)
  const c = detail.case
  const open = c.status === 'open'
  const adjournedFor = new Map(detail.adjournments.map((a) => [a.sittingId, a]))
  const accused = detail.parties.filter((p) => p.role === 'accused').map((p) => p.name)
  const scheduled = detail.sittings.filter((s) => s.status === 'scheduled').sort((a, b) => a.scheduledAt - b.scheduledAt)

  const facts: [string, string | null][] = [
    ['Court', courtLevelLabel(c.courtLevel)],
    ['Offence', c.offence],
    ['Registered', c.registeredOn ? format(c.registeredOn, 'PP') : null],
    ['Next sitting', scheduled[0] ? `${format(scheduled[0].scheduledAt, 'PPp')}, ${purposeLabel(scheduled[0].purpose).toLowerCase()}` : open ? 'None fixed' : null],
    ['Adjournments', String(detail.adjournments.length)],
    ['Outcome', c.outcome],
    ['Notes', c.notes],
  ]

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{c.courtNumber}</h1>
          <p>{c.title}</p>
        </div>
        <div className="page-actions">
          {open ? <Tag tone={scheduled.length ? 'open' : 'urgent'}>{scheduled.length ? 'Open' : 'No next date'}</Tag> : <Tag tone="done">Concluded</Tag>}
          <PanelButton label="Edit" title="Edit the case" description="Correct the number, title or offence." variant="secondary" icon={false}>
            {({ close, setDirty: report }) => <CaseForm existing={c} onSuccess={close} onDirtyChange={report} />}
          </PanelButton>
          {open ? (
            <>
              <PanelButton label="Schedule a sitting" title="Schedule a sitting" description="Fix a date for this case to be heard.">
                {({ close, setDirty: report }) => <SittingForm caseId={caseId} onSuccess={close} onDirtyChange={report} />}
              </PanelButton>
              <PanelButton label="Draft a decision" title="Draft a ruling or judgment" description="Starts a draft. You write it in its own page.">
                {({ close, setDirty: report }) => (
                  <RulingCreateForm
                    caseId={caseId}
                    onDirtyChange={report}
                    onSuccess={(ruling) => {
                      close()
                      void navigate({ to: '/rulings/$rulingId', params: { rulingId: ruling.id } })
                    }}
                  />
                )}
              </PanelButton>
              <PanelButton label="Draft an order" title="Draft an order" description="Choose the kind of order and give the facts.">
                {({ close, setDirty: report }) => <OrderForm caseId={caseId} accused={accused} onSuccess={close} onDirtyChange={report} />}
              </PanelButton>
              <Button size="sm" variant="secondary" onClick={() => setConclude(true)}>
                Conclude
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => reopen.mutate(caseId, { onSuccess: () => t.success('Case reopened'), onError: (error) => t.error('Could not reopen the case', { description: messageOf(error) }) })}
            >
              Reopen
            </Button>
          )}
        </div>
      </header>

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
          <section aria-labelledby="people" className="page-section">
            <div className="section-head">
              <h2 id="people">People</h2>
              {open && (
                <PanelButton label="Add" title="Add a person" description="Someone in this case: the accused, the complainant, or counsel." variant="ghost">
                  {({ close, setDirty: report }) => <PartyForm caseId={caseId} onSuccess={close} onDirtyChange={report} />}
                </PanelButton>
              )}
            </div>
            {detail.parties.length === 0 ? (
              <EmptyNote>No one has been recorded in this case yet. Add the accused first.</EmptyNote>
            ) : (
              <RowList>
                {detail.parties.map((p) => (
                  <PartyRow key={p.id} party={p} editable={open} caseId={caseId} />
                ))}
              </RowList>
            )}
          </section>

          <section aria-labelledby="sittings" className="page-section">
            <div className="section-head">
              <h2 id="sittings">Sittings</h2>
              {detail.sittings.length > 0 && <Tag tone="neutral">{plural(detail.sittings.length, 'sitting')}</Tag>}
            </div>
            {detail.sittings.length === 0 ? (
              <EmptyNote>No sitting has been scheduled for this case.</EmptyNote>
            ) : (
              <RowList>
                {detail.sittings.map((s: Sitting) => {
                  const adjournment = adjournedFor.get(s.id)
                  return (
                    <Row
                      key={s.id}
                      marker={s.status === 'scheduled' ? 'open' : undefined}
                      aligned
                      title={`${format(s.scheduledAt, 'PPp')}, ${purposeLabel(s.purpose).toLowerCase()}`}
                      summary={
                        [s.courtroom, s.status === 'adjourned' ? adjournmentLine(adjournment) : s.outcome, s.note].filter(Boolean).join('. ') || undefined
                      }
                      trailing={
                        s.status === 'scheduled' ? (
                          <>
                            <Link to="/sittings/$sittingId" params={{ sittingId: s.id }} className={openLink}>Open</Link>
                            <SittingActions sitting={s} caseId={caseId} />
                          </>
                        ) : (

                          <>
                            <Tag tone={sittingTone[s.status as keyof typeof sittingTone] ?? 'neutral'}>{sittingStatusLabels[s.status] ?? s.status}</Tag>
                            <Link to="/sittings/$sittingId" params={{ sittingId: s.id }} className={openLink}>Open</Link>
                            {s.status === 'adjourned' && (
                              <PanelButton label="Draft order" title="Order of adjournment" description="Starts from what was recorded when the sitting was adjourned." variant="ghost" icon={false}>
                                {({ close, setDirty: report }) => <OrderForm caseId={caseId} sittingId={s.id} kind="adjournment" onSuccess={close} onDirtyChange={report} />}
                              </PanelButton>
                            )}
                          </>
                        )
                      }
                    />
                  )
                })}
              </RowList>
            )}
          </section>

          <section aria-labelledby="exhibits" className="page-section">
            <div className="section-head">
              <h2 id="exhibits">Exhibits</h2>
              {open && (
                <PanelButton label="Mark an exhibit" title="Mark an exhibit" description="Given the next label for the side that produces it." variant="ghost">
                  {({ close, setDirty: report }) => <MarkExhibitForm caseId={caseId} onSuccess={close} onDirtyChange={report} />}
                </PanelButton>
              )}
            </div>
            {detail.exhibits.length === 0 ? (
              <EmptyNote>No exhibit has been marked in this case.</EmptyNote>
            ) : (
              <RowList>
                {detail.exhibits.map((e) => (
                  <ExhibitLine key={e.id} exhibit={e} />
                ))}
              </RowList>
            )}
          </section>

          <section aria-labelledby="decisions" className="page-section">
            <h2 id="decisions">Rulings and judgments</h2>
            {detail.rulings.length === 0 ? (
              <EmptyNote>No decision has been drafted for this case.</EmptyNote>
            ) : (
              <RowList>
                {detail.rulings.map((r) => (
                  <Row
                    key={r.id}
                    aligned
                    marker={r.status === 'draft' && r.reservedOn ? 'urgent' : undefined}
                    title={
                      <Link to="/rulings/$rulingId" params={{ rulingId: r.id }} className="text-foreground">
                        {r.reference ?? r.title}
                      </Link>
                    }
                    summary={`${rulingKindLabel(r.kind)}${r.status === 'delivered' && r.deliveredOn ? `, delivered ${format(r.deliveredOn, 'PP')}` : r.reservedOn ? `, reserved ${format(r.reservedOn, 'PP')}, not yet delivered` : ', draft'}.`}
                    trailing={
                      <>
                        {r.status === 'delivered' ? <Tag tone="done">Delivered</Tag> : r.reservedOn ? <Tag tone="urgent">Reserved</Tag> : <Tag tone="open">Draft</Tag>}
                        <Link to="/rulings/$rulingId" params={{ rulingId: r.id }} className={openLink}>Open</Link>
                      </>
                    }
                  />
                ))}
              </RowList>
            )}
          </section>

          <section aria-labelledby="orders" className="page-section">
            <h2 id="orders">Orders</h2>
            {detail.orders.length === 0 ? (
              <EmptyNote>No order has been drafted for this case.</EmptyNote>
            ) : (
              <RowList>
                {detail.orders.map((o) => (
                  <Row
                    key={o.id}
                    aligned
                    title={
                      <Link to="/orders/$orderId" params={{ orderId: o.id }} className="text-foreground">
                        {o.reference ?? o.title}
                      </Link>
                    }
                    summary={`${orderKindLabel(o.kind)}${o.issuedAt ? `, issued ${format(o.issuedAt, 'PP')}` : ', not yet issued'}.`}
                    trailing={
                      <>
                        {o.status === 'issued' ? <Tag tone="done">Issued</Tag> : <Tag tone="open">Draft</Tag>}
                        <Link to="/orders/$orderId" params={{ orderId: o.id }} className={openLink}>Open</Link>
                      </>
                    }
                  />
                ))}
              </RowList>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="history" className="page-section">
            <h2 id="history">History of this case</h2>
            {!history || history.length === 0 ? (
              <EmptyNote>Nothing has been recorded yet.</EmptyNote>
            ) : (
              <RowList>
                {history.map((entry) => (
                  <Row
                    key={entry.seq}
                    title={describeAction(entry.action)}
                    summary={`${formatDistanceToNowStrict(entry.at, { addSuffix: true })}${entry.actor ? `, ${entry.actor}` : ''}.`}
                  />
                ))}
              </RowList>
            )}
          </section>
        </div>
      </div>

      <Createpanel
        open={conclude}
        onOpenChange={(next) => {
          if (!next) {
            setConclude(false)
            setDirty(false)
          }
        }}
        isDirty={dirty}
        headings={{ title: 'Conclude the case', description: 'Record how the case ended. It can be reopened later.' }}
      >
        <ConcludeForm caseId={caseId} onDirtyChange={setDirty} onSuccess={() => setConclude(false)} />
      </Createpanel>
    </article>
  )
}
