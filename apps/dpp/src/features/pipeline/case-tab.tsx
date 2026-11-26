import { ChoiceSelect } from '@/components/choice-select'
import { useAssistSettings } from '@/features/assist/queries'
import { templatesForDecision } from '@/features/templates'
import { useMakeDocument } from '@/features/templates/new-document'
import { activeJurisdiction } from '@/lib/jurisdiction'
import { FileTasks } from '@/features/board'
import { useChargesForFile } from '@/features/charges'
import { criteria, findings } from '@/features/charging-review/schema'
import { CourtRecord } from '@/features/court'
import { CustodyPanel, useCustody } from '@/features/custody'
import { availableDecisionTypes, decisionTypeLabel } from '@/features/decisions/schema'
import { directionKinds } from '@/features/directions/schema'
import { DecisionsPanel } from '@/features/file-workspace/decision-panels'
import { ReviewPanel } from '@/features/file-workspace/material-panel'
import { useFileItems, type FileItem } from '@/features/file-index'
import { useDocuments } from '@/features/documents/queries'
import type { DocumentRecord } from '@/features/documents/schema'
import { statementRoleLabel, useStatementsForFile, type Statement } from '@/features/statements'
import { useBrand } from '@/features/installation'
import { personFullNameForRole, useFilePeople, type ProsecutionFile } from '@/features/prosecution-files'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { AlertCircleIcon, ArrowRight01Icon, Mail01Icon, PrinterIcon, Download04Icon, SparklesIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { Textarea } from '@pleadli/ui/textarea'
import { Link } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { stageAbout, stageLabel, stages, stepAbout, stepLabel, stepOf, steps, type Proposal, type Stage } from './data'
import { SendBoard } from '@/features/file-workspace/send-board'
import { DecideBoard } from '@/features/file-workspace/decide-board'
import { PeruseBrief } from './peruse-brief'
import { actionLabel, holderLabel, useAttention } from '@/features/attention'
import { MaterialPanel } from '@/features/file-workspace/material-panel'
import { buildCaseFile, emailCaseFile, printCaseFile, saveCaseFile } from './export-file'
import { useAnswer, useHandovers, usePropose, useProposals, useRecordHandover, useSetStage } from './queries'

const selectClass = 'h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
const outcomes = ['convicted', 'acquitted', 'withdrawn', 'declined', 'diverted', 'returned_not_resubmitted', 'other'] as const
const methods = ['connection', 'email', 'print', 'collection', 'download', 'other'] as const

export const outcomeLabel = (o: string) =>
  (
    ({
      convicted: m["outcome.convicted"],
      acquitted: m["outcome.acquitted"],
      withdrawn: m["outcome.withdrawn"],
      declined: m["outcome.declined"],
      diverted: m["outcome.diverted"],
      returned_not_resubmitted: m["outcome.returned_not_resubmitted"],
      other: m["outcome.other"],
    }) as Record<string, () => string>
  )[o]?.() ?? o

export const methodLabel = (x: string) =>
  (
    ({
      connection: m["handover.method.connection"],
      email: m["handover.method.email"],
      print: m["handover.method.print"],
      collection: m["handover.method.collection"],
      download: m["handover.method.download"],
      other: m["handover.method.other"],
    }) as Record<string, () => string>
  )[x]?.() ?? x

/** The steps, left to right: Peruse, Decide, Send, In court. The file's step is
 * marked; any step can be looked at, and it opens at the stage the file is in
 * when that stage is inside it. */
export function StageStepper({ current, viewing, onView }: { current: Stage; viewing: Stage; onView: (s: Stage) => void }) {
  const at = steps.indexOf(stepOf(current))
  const looking = stepOf(viewing)
  return (
    <ol aria-label={m["timeline.label"]()} className="no-scrollbar flex list-none items-start overflow-x-auto p-0">
      {steps.map((step, i) => (
        <li key={step.id} className="relative flex min-w-24 flex-1 flex-col items-center">
          {i > 0 && <span aria-hidden className={cn('absolute top-3 right-1/2 left-[-50%] h-0.5', i <= at ? 'bg-primary' : 'bg-border')} />}
          <button
            type="button"
            onClick={() => onView(stepOf(current) === step ? current : step.stages[0])}
            aria-current={i === at ? 'step' : undefined}
            className="relative flex cursor-pointer flex-col items-center gap-1.5 rounded-lg px-2 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full transition-colors',
                i < at && 'bg-primary text-primary-foreground',
                i === at && 'bg-primary text-primary-foreground ring-4 ring-primary/20',
                i > at && 'bg-background ring-2 ring-border ring-inset',
                step === looking && i !== at && 'ring-2 ring-foreground/40',
              )}
            >
              {i < at ? <HugeiconsIcon icon={Tick02Icon} className="size-3.5" /> : i === at ? <span className="size-2 rounded-full bg-primary-foreground" /> : null}
            </span>
            <span className={cn('text-xs whitespace-nowrap', i <= at ? 'text-foreground' : 'text-muted-foreground', (i === at || step === looking) && 'font-semibold')}>{stepLabel(step.id)}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

type Body = Record<string, any>

/** The Evidential Test is not "passed" while one of its own criteria (the
 * defence above all) is unresolved or against charging. The server holds new
 * proposals to this; older ones, saved before it did, are held the same way
 * when they are opened. The Public Interest Test is left to the prosecutor: a
 * factor that does not arise is often just not assessed. */
function holdUnsettled(body: Body): Body {
  const next = { ...body }
  const unsettled = (next.evidential as Body[] | undefined)?.some((f) => f.finding === 'unresolved' || f.finding === 'against')
  if (unsettled && next.evidentialOutcome === 'passed') next.evidentialOutcome = 'unresolved'
  return next
}

/** A proposal's content, editable where the prosecutor would want to change
 * it before accepting. */
function ProposalBody({ stage, body, set }: { stage: string; body: Body; set: (b: Body) => void }) {
  const patch = (k: string, v: unknown) => set({ ...body, [k]: v })

  if (stage === 'receive') {
    return <p>{m["pipe.receive_body"]({ documents: body.documents ?? 0, unchecked: body.unchecked ?? 0, people: body.people ?? 0, charges: body.charges ?? 0 })}</p>
  }
  if (stage === 'prepare') {
    if (!body.decisionId) return <p>{m["pipe.prepare_no_decision"]()}</p>
    const { primary } = templatesForDecision(activeJurisdiction(), body.decision)
    return primary.length ? (
      <p>{m["pipe.prepare_body"]({ document: primary.map((t) => t.title).join(', '), decision: decisionTypeLabel(body.decision) })}</p>
    ) : (
      <p>{m["pipe.prepare_nothing"]({ decision: decisionTypeLabel(body.decision) })}</p>
    )
  }
  if (stage === 'review') {
    const findingsFor = (key: 'evidential' | 'publicInterest', test: 'evidential' | 'public_interest') => (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <strong>{criteria[test].label}</strong>
          <ChoiceSelect className={selectClass} value={body[`${key}Outcome`] ?? 'unresolved'} onChange={(e) => patch(`${key}Outcome`, e.target.value)}>
            <option value="passed">{m["review.outcome.passed"]()}</option>
            <option value="failed">{m["review.outcome.failed"]()}</option>
            <option value="unresolved">{m["review.finding.unresolved"]()}</option>
          </ChoiceSelect>
        </div>
        <ul className="flex list-none flex-col gap-1 p-0">
          {(body[key] as Body[] | undefined)?.map((f, i) => (
            <li key={i} className="grid grid-cols-[minmax(7rem,10rem)_11rem_minmax(0,1fr)] items-start gap-2 text-sm">
              <span className="pt-2">{criteria[test].items.find((c) => c.id === f.criterion)?.label ?? f.criterion}</span>
              <ChoiceSelect
                className={cn(selectClass, 'w-full min-w-0')}
                value={f.finding}
                onChange={(e) => patch(key, (body[key] as Body[]).map((x, j) => (j === i ? { ...x, finding: e.target.value } : x)))}
              >
                {findings.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </ChoiceSelect>
              <span className="pt-2 text-muted-foreground">{f.note}</span>
            </li>
          ))}
        </ul>
      </div>
    )
    return (
      <div className="flex flex-col gap-4">
        <Field label={m["assist.summary"]()}>
          <Textarea value={body.summary ?? ''} onChange={(e) => patch('summary', e.target.value)} className="min-h-28" />
        </Field>
        {findingsFor('evidential', 'evidential')}
        {findingsFor('publicInterest', 'public_interest')}
        {(body.missing as string[] | undefined)?.length ? (
          <div>
            <strong>{m["assist.missing"]()}</strong>
            <ul className="flex flex-col gap-1 pl-4">{(body.missing as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        ) : null}
        {(body.procedure as string[] | undefined)?.length ? (
          <div className="rounded-xl bg-destructive/5 p-3 ring-1 ring-destructive/20">
            <strong>{m["pipe.procedure"]()}</strong>
            <ul className="flex flex-col gap-1 pl-4">{(body.procedure as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        ) : null}
        {(body.contradictions as string[] | undefined)?.length ? (
          <div>
            <strong>{m["assist.contradictions"]()}</strong>
            <ul className="flex flex-col gap-1 pl-4">{(body.contradictions as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        ) : null}
      </div>
    )
  }
  if (stage === 'decide') {
    const directions = (body.directions as Body[] | undefined) ?? []
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground">{m["peruse.choose"]()}</span>
          <div className="flex flex-wrap gap-3">
            {([['sanction', 'sanction'], ['return_for_investigation', 'return'], ['decline', 'close']] as const)
              .filter(([kind]) => availableDecisionTypes().some((d) => d.value === kind))
              .map(([kind, key]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => patch('kind', kind)}
                  className={cn('flex min-w-44 flex-1 cursor-pointer flex-col gap-1 rounded-2xl p-4 text-left ring-1', body.kind === kind ? 'bg-primary/5 ring-2 ring-primary' : 'bg-card ring-border hover:bg-secondary/40')}
                >
                  <strong className="text-base font-semibold">{m[`peruse.${key}`]()}</strong>
                  <span className="text-sm text-muted-foreground">{m[`peruse.${key}_about`]()}</span>
                </button>
              ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {m["peruse.other_decisions"]()}
            <ChoiceSelect className={selectClass} value={['sanction', 'return_for_investigation', 'decline'].includes(body.kind) ? '' : body.kind} onChange={(e) => e.target.value && patch('kind', e.target.value)}>
              <option value="">{['sanction', 'return_for_investigation', 'decline'].includes(body.kind) ? '—' : decisionTypeLabel(body.kind)}</option>
              {availableDecisionTypes()
                .filter((d) => !['sanction', 'return_for_investigation', 'decline'].includes(d.value))
                .map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
            </ChoiceSelect>
          </label>
          <p className="text-xs text-muted-foreground">{m["peruse.director_only"]()}</p>
        </div>
        <Field label={m["pipe.reasons"]()}>
          <Textarea value={body.reasons ?? ''} onChange={(e) => patch('reasons', e.target.value)} className="min-h-32" />
        </Field>
        {body.kind === 'return_for_investigation' && (
          <div className="flex flex-col gap-2">
            <strong>{m["pipe.directions"]()}</strong>
            {directions.map((d, i) => (
              <div key={i} className="grid grid-cols-[10rem_1fr] gap-2">
                <ChoiceSelect className={selectClass} value={d.kind} onChange={(e) => patch('directions', directions.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}>
                  {directionKinds.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </ChoiceSelect>
                <Input value={d.instruction} onChange={(e) => patch('directions', directions.map((x, j) => (j === i ? { ...x, instruction: e.target.value } : x)))} />
              </div>
            ))}
            <Button size="xs" variant="ghost" className="w-fit" onClick={() => patch('directions', [...directions, { kind: 'investigation', instruction: '' }])}>
              {m["pipe.add_direction"]()}
            </Button>
          </div>
        )}
      </div>
    )
  }
  if (stage === 'handover') {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <Field label={m["pipe.recipient"]()}>
            <Input value={body.recipient ?? ''} onChange={(e) => patch('recipient', e.target.value)} />
          </Field>
          <Field label={m["pipe.method"]()}>
            <ChoiceSelect className={selectClass} value={body.method} onChange={(e) => patch('method', e.target.value)}>
              {methods.map((x) => (
                <option key={x} value={x}>
                  {methodLabel(x)}
                </option>
              ))}
            </ChoiceSelect>
          </Field>
        </div>
        <Field label={m["pipe.covering_note"]()}>
          <Textarea value={body.note ?? ''} onChange={(e) => patch('note', e.target.value)} className="min-h-32" />
        </Field>
        <Field label={m["pipe.reply_days"]()}>
          <Input type="number" min={0} className="w-28" value={body.replyDays ?? 0} onChange={(e) => patch('replyDays', Number(e.target.value))} />
        </Field>
      </div>
    )
  }
  if (stage === 'follow_up') {
    return (
      <div className="flex flex-col gap-3">
        {body.summary && <p>{body.summary}</p>}
        <ul className="flex list-none flex-col gap-2 p-0">
          {(body.steps as Body[] | undefined)?.map((s, i) => (
            <li key={i} className="flex items-start justify-between gap-3 rounded-xl p-3 ring-1 ring-border/60">
              <div className="flex flex-col">
                <strong>{s.title}</strong>
                <span className="text-muted-foreground">{s.why}</span>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{s.dueInDays ? m["pipe.in_days"]({ days: s.dueInDays }) : ''}</span>
            </li>
          ))}
        </ul>
        {body.readyToConclude && <p className="text-primary">{m["pipe.ready_to_conclude"]()}</p>}
      </div>
    )
  }
  // concluded
  return (
    <div className="flex flex-col gap-3">
      <Field label={m["pipe.outcome"]()}>
        <ChoiceSelect className={selectClass} value={body.outcome} onChange={(e) => patch('outcome', e.target.value)}>
          {outcomes.map((o) => (
            <option key={o} value={o}>
              {outcomeLabel(o)}
            </option>
          ))}
        </ChoiceSelect>
      </Field>
      <Field label={m["pipe.closing_note"]()}>
        <Textarea value={body.note ?? ''} onChange={(e) => patch('note', e.target.value)} className="min-h-28" />
      </Field>
    </div>
  )
}

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').trim()

function documentText(doc: DocumentRecord) {
  return doc.content.blocks
    .map((b) => {
      switch (b.type) {
        case 'fields':
          return b.rows.map((r) => `${r.label}: ${r.value}`).join('\n')
        case 'list':
          return b.items.map((i, n) => `${b.ordered ? `${n + 1}.` : '-'} ${i.title ? `${i.title}. ` : ''}${i.text}`).join('\n')
        case 'signature':
          return `${b.label}: ${b.name}`
        default:
          return b.text
      }
    })
    .join('\n\n')
}

/** Issued documents written to leave the office: to Police, a court or the
 * record. Everything else, above all the written reasons for declining
 * (privileged, never for unauthorised persons) and closure decisions, stays
 * inside unless a kind is added here on purpose. */
const LEAVES_THE_OFFICE = new Set(['charge_sheet', 'directions_to_police', 'further_investigation', 'indictment', 'summary_of_case'])

/** Written reasons for declining are privileged between the ODPP and the
 * investigating agency. They go in a handover only when the officer ticks it. */
const PRIVILEGED_KIND = 'decline_reasons'

/** The papers that make up a handover. Typed statements and the issued
 * documents that may leave count as well as indexed scans, so a file the office
 * built by typing can still be saved, printed or emailed. Drafts never go out. */
export function handoverMaterial(fileId: string, indexed: FileItem[], statements: Statement[], documents: DocumentRecord[], withPrivileged = false): FileItem[] {
  const base = indexed.length
  const typed: FileItem[] = statements.map((s, i) => ({
    id: `statement:${s.id}`,
    prosecutionFileId: fileId,
    kind: s.statementRole === 'accused' ? 'accused_statement' : 'witness_statement',
    title: `${[s.personFirstName, s.personLastName].join(' ')} · ${statementRoleLabel(s.statementRole)}`,
    documentDate: s.givenAt,
    attachmentId: null,
    pageFrom: null,
    pageTo: null,
    summary: null,
    body: plain(s.content ?? ''),
    people: null,
    position: base + i,
    source: 'person',
    confirmedBy: null,
    confirmedAt: null,
    createdBy: null,
    createdAt: s.createdAt,
    updatedAt: s.createdAt,
  }))
  const issued: FileItem[] = documents
    .filter((d) => d.status === 'issued' && (LEAVES_THE_OFFICE.has(d.kind) || (withPrivileged && d.kind === PRIVILEGED_KIND)))
    .map((d, i) => ({
      id: `document:${d.id}`,
      prosecutionFileId: fileId,
      kind: d.kind === 'charge_sheet' ? 'charge_sheet' : 'correspondence',
      title: d.reference ? `${d.title} (${d.reference})` : d.title,
      documentDate: d.issuedAt,
      attachmentId: null,
      pageFrom: null,
      pageTo: null,
      summary: null,
      body: documentText(d),
      people: null,
      position: base + typed.length + i,
      source: 'person',
      confirmedBy: null,
      confirmedAt: null,
      createdBy: null,
      createdAt: d.issuedAt ?? d.preparedAt,
      updatedAt: d.issuedAt ?? d.preparedAt,
    }))
  return [...indexed, ...typed, ...issued]
}

/** Save, print, email: the whole case file as one organised PDF. */
export function HandOverTools({ file }: { file: ProsecutionFile }) {
  const { data: indexed = [] } = useFileItems(file.id)
  const { data: statements = [] } = useStatementsForFile(file.id)
  const { data: documents = [] } = useDocuments(file.id)
  const { data: people = [] } = useFilePeople(file.id)
  const { data: charges = [] } = useChargesForFile(file.id)
  const { data: brand } = useBrand()
  const record = useRecordHandover()
  const [busy, setBusy] = useState<string | null>(null)
  // What goes out is the whole file as it stands: the indexed papers, the
  // statements typed in, and every document this office has issued on it.
  const reasons = documents.find((d) => d.status === 'issued' && d.kind === PRIVILEGED_KIND)
  const [withReasons, setWithReasons] = useState(true)
  const items = handoverMaterial(file.id, indexed, statements, documents, withReasons)

  const build = () =>
    buildCaseFile({
      officeName: brand?.officeName ?? null,
      logo: brand?.logo ?? null,
      file,
      accused: people.filter((p) => p.role === 'accused').map(personFullNameForRole),
      offences: charges.map((c) => c.offence),
      items,
    })

  const act = async (kind: 'download' | 'print' | 'email') => {
    setBusy(kind)
    try {
      const bytes = await build()
      if (kind === 'print') {
        await printCaseFile(bytes, file.title)
        record.mutate({ prosecutionFileId: file.id, recipient: m["handover.printed"](), method: 'print' })
      } else {
        const saved = await saveCaseFile(bytes, file.title)
        if (!saved) return
        if (kind === 'email') {
          await emailCaseFile('', `${file.title}${file.policeReference ? ` (${file.policeReference})` : ''}`, m["handover.email_body"]({ title: file.title }))
          t.success(m["handover.email_attach"]())
        } else {
          t.success(m["handover.saved"]())
        }
        record.mutate({ prosecutionFileId: file.id, recipient: kind === 'email' ? m["handover.by_email"]() : m["handover.saved_copy"](), method: kind === 'email' ? 'email' : 'download' })
      }
    } catch (e) {
      t.error(m["handover.failed"](), { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {([
          ['download', Download04Icon, m["peruse.send_download"](), m["peruse.send_download_about"](), m["handover.download"]()],
          ['print', PrinterIcon, m["peruse.send_print"](), m["peruse.send_print_about"](), m["handover.print"]()],
          ['email', Mail01Icon, m["peruse.send_email"](), m["peruse.send_email_about"](), m["handover.email"]()],
        ] as const).map(([kind, icon, title, about]) => (
          <button
            key={kind}
            type="button"
            disabled={busy !== null || items.length === 0}
            onClick={() => act(kind)}
            className="flex min-w-48 flex-1 cursor-pointer flex-col gap-1 rounded-2xl bg-card p-4 text-left ring-1 ring-border hover:bg-secondary/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <HugeiconsIcon icon={icon} className="size-4" />
              {busy === kind ? m["handover.building"]() : title}
            </span>
            <span className="text-sm text-muted-foreground">{about}</span>
          </button>
        ))}
      </div>
      {reasons && (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={withReasons} onChange={(e) => setWithReasons(e.target.checked)} />
          <span>
            {m["handover.with_reasons"]({ station: file.policeStation ?? m["handover.the_agency"]() })}
            <span className="block text-muted-foreground">{m["handover.with_reasons_about"]()}</span>
          </span>
        </label>
      )}
      {items.length === 0 && <p className="text-sm text-muted-foreground">{m["peruse.send_no_index"]()}</p>}
      <p className="text-sm text-muted-foreground">{m["peruse.send_next"]()}</p>
    </div>
  )
}

/** What the prosecutor can do by hand at a stage, without Assist. */
function DoItYourself({ stage, file }: { stage: Stage; file: ProsecutionFile }) {
  switch (stage) {
    case 'receive':
      return (
        <div className="flex flex-col gap-5">
          <MaterialPanel fileId={file.id} aside={<PeruseBrief fileId={file.id} rail />} />
          <p className="text-sm text-muted-foreground">
            {m["pipe.diy_receive"]()}{' '}
            <Link to="/files/$fileId" params={{ fileId: file.id }} search={{ tab: 'papers' }}>
              {m["file_tab.index"]()}
            </Link>
          </p>
        </div>
      )
    case 'review':
      return (
        <div className="flex flex-col gap-5">
          <MaterialPanel fileId={file.id} aside={<PeruseBrief fileId={file.id} rail />} />
          <ReviewPanel fileId={file.id} />
        </div>
      )
    case 'decide':
      return (
        <div className="flex flex-col gap-8">
          <DecideBoard fileId={file.id} />
          <DecisionsPanel fileId={file.id} />
        </div>
      )
    case 'prepare':
    case 'handover':
      return <SendBoard file={file} delivery={<HandOverTools file={file} />} />
    case 'follow_up':
      return (
        <div className="flex flex-col gap-6">
          <FileTasks fileId={file.id} />
          <CourtRecord fileId={file.id} />
        </div>
      )
    default:
      return <FileTasks fileId={file.id} />
  }
}

/** The Case tab: where the file is, what Assist proposes for this stage, and
 * the one button that accepts it. */
export function CaseTab({ file }: { file: ProsecutionFile }) {
  const current = file.stage
  const [viewing, setViewing] = useState<Stage>(current)
  useEffect(() => {
    setViewing(current)
  }, [current])
  const { data: proposals = [] } = useProposals(file.id)
  const { data: handovers = [] } = useHandovers(file.id)
  const { data: assist } = useAssistSettings()
  const { data: custody = [] } = useCustody(file.id)
  const { forFile } = useAttention()
  const next = forFile(file.id)
  const propose = usePropose(file.id)
  const answer = useAnswer()
  const move = useSetStage()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')

  const open = proposals.find((p) => p.stage === viewing && p.status === 'proposed')
  const done = proposals.filter((p) => p.stage === viewing && p.status !== 'proposed')
  const [draft, setDraft] = useState<Body | null>(null)
  useEffect(() => {
    setDraft(open ? holdUnsettled(structuredClone(open.body)) : null)
  }, [open?.id])

  const needsModel = !['receive', 'prepare'].includes(viewing)
  const canPropose = !needsModel || assist?.ready
  const idx = stages.indexOf(current)

  const makeDoc = useMakeDocument(file.id)
  const accept = async (p: Proposal) => {
    let body = draft ?? undefined
    // Prepare: the documents come from the country's templates, made here.
    if (p.stage === 'prepare' && body?.decisionId) {
      const { primary } = templatesForDecision(activeJurisdiction(), body.decision)
      for (const tpl of primary) await makeDoc.make(tpl, body.decisionId, false)
      body = { ...body, document: null }
    }
    answer.mutate(
      { id: p.id, answer: 'accept', body },
      {
        onSuccess: (r) => t.success(m["pipe.accepted"]({ stage: stageLabel(r.stage) })),
        onError: (e) => t.error(m["pipe.accept_failed"](), { description: e.message }),
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* A running legal clock outranks everything else on the file. */}
      {custody.length > 0 && <CustodyPanel fileId={file.id} />}
      {/* The one answer to "what is next on this file, and who has it", the same one Today and the Case files list show. */}
      {next && next.action !== 'closed' && (
        <p className="mt-2 text-base">
          <span className="font-semibold">{actionLabel(next)}</span>
          <span className="text-muted-foreground">
            {' · '}
            {next.needsMe ? m['attn.needs_you']() : holderLabel(next)}
            {next.overdue && next.dueAt ? ` · ${m['today.deadline.overdue']({ date: formatDate(next.dueAt) })}` : ''}
          </span>
        </p>
      )}
      <StageStepper current={current} viewing={viewing} onView={setViewing} />

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-xs ring-1 ring-border/70">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2>{stepLabel(stepOf(viewing).id)}</h2>
            <p className="text-muted-foreground">{stepAbout(stepOf(viewing).id)}</p>
            {stepOf(viewing).stages.length > 1 && (
              <div role="tablist" className="mt-1 flex w-fit items-center gap-1 border-b border-border/40">
                {stepOf(viewing).stages.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={s === viewing}
                    onClick={() => setViewing(s)}
                    className={cn('relative h-9 cursor-pointer px-3 text-[0.8125rem] outline-none transition-colors', s === viewing ? 'font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {stageLabel(s)}
                  </button>
                ))}
              </div>
            )}
            {stepOf(viewing).stages.length > 1 && <p className="text-sm text-muted-foreground">{stageAbout(viewing)}</p>}
          </div>
          {stepOf(viewing).id === 'peruse' && stepOf(current).id === 'peruse' && (
            <Button disabled={move.isPending} onClick={() => move.mutate({ fileId: file.id, stage: 'decide' })}>
              {m["peruse.continue_decide"]()}
            </Button>
          )}
          {stepOf(viewing).id === 'decide' && <span className="text-sm text-muted-foreground">{m["peruse.saved_as_you_go"]()}</span>}
          {viewing !== current && (
            <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
              {stages.indexOf(viewing) < idx ? m["pipe.stage_past"]() : m["pipe.stage_future"]()}
            </span>
          )}
        </header>

        {file.stage === 'concluded' && viewing === 'concluded' && file.outcome && (
          <p className="rounded-xl bg-primary/5 p-3 ring-1 ring-primary/20">
            {m["pipe.concluded_as"]({ outcome: outcomeLabel(file.outcome), date: file.concludedAt ? formatDate(file.concludedAt) : '' })}
          </p>
        )}

        {open && draft ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm text-primary">
              <HugeiconsIcon icon={SparklesIcon} className="size-4" />
              {open.model === 'record' ? m["pipe.from_record"]() : m["pipe.proposed_by"]({ model: open.model, date: formatDate(open.createdAt, 'datetime') })}
            </div>
            <ProposalBody stage={viewing} body={draft} set={setDraft} />
            {rejecting ? (
              <div className="flex flex-col gap-2">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={m["pipe.reject_why"]()} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                    {m["common.cancel"]()}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => answer.mutate({ id: open.id, answer: 'reject', note }, { onSuccess: () => { setRejecting(false); setNote('') } })}
                  >
                    {m["pipe.reject"]()}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
                <Button variant="ghost" size="sm" onClick={() => setRejecting(true)}>
                  {m["pipe.reject"]()}
                </Button>
                <div className="flex gap-2">
                  {needsModel && (
                    <Button variant="secondary" size="sm" disabled={propose.isPending} onClick={() => propose.mutate(viewing)}>
                      {m["pipe.ask_again"]()}
                    </Button>
                  )}
                  <Button size="sm" disabled={answer.isPending || viewing !== current} onClick={() => void accept(open)}>
                    <HugeiconsIcon icon={Tick02Icon} />
                    {viewing === 'concluded' ? m["pipe.accept_conclude"]() : m["pipe.accept"]()}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* The stage's own work, there to do: nothing hidden behind a fold. */}
            <DoItYourself stage={viewing} file={file} />
            {viewing === current && current !== 'concluded' && canPropose && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" size="sm" disabled={propose.isPending} onClick={() => propose.mutate(viewing, { onError: (e) => t.error(m["pipe.propose_failed"](), { description: e.message }) })}>
                  <HugeiconsIcon icon={SparklesIcon} className={cn(propose.isPending && 'animate-pulse')} />
                  {propose.isPending ? m["pipe.preparing"]() : needsModel ? m["pipe.ask_assist"]() : m["pipe.check"]()}
                </Button>
                {propose.isError && (
                  <span className="not-typeset flex items-center gap-1 text-destructive">
                    <HugeiconsIcon icon={AlertCircleIcon} className="size-4" />
                    {propose.error.message}
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {done.length > 0 && (
          <ul className="flex list-none flex-col gap-1 p-0 text-sm text-muted-foreground">
            {done.slice(0, 3).map((p) => (
              <li key={p.id}>
                {m["pipe.answered"]({
                  status: p.status === 'rejected' ? m["pipe.status.rejected"]() : p.status === 'edited' ? m["pipe.status.edited"]() : m["pipe.status.accepted"](),
                  who: p.decidedBy ?? '',
                  date: p.decidedAt ? formatDate(p.decidedAt, 'datetime') : '',
                })}
                {p.responseNote ? `: ${p.responseNote}` : ''}
              </li>
            ))}
          </ul>
        )}

        {viewing === 'handover' && handovers.length > 0 && (
          <ul className="flex list-none flex-col gap-1 p-0 text-sm">
            {handovers.map((h) => (
              <li key={h.id} className="flex justify-between gap-2">
                <span>
                  {methodLabel(h.method)}: {h.recipient}
                </span>
                <span className="text-muted-foreground">{formatDate(h.handedAt, 'datetime')}</span>
              </li>
            ))}
          </ul>
        )}

        {viewing === current && current !== 'concluded' && (
          <div className="flex justify-end border-t border-border/60 pt-4">
            <Button size="sm" onClick={() => move.mutate({ fileId: file.id, stage: stages[idx + 1] })}>
              {m["pipe.move_on"]({ stage: stageLabel(stages[idx + 1]) })}
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Button>
          </div>
        )}
      </section>

      {custody.length === 0 && <CustodyPanel fileId={file.id} quiet />}
    </div>
  )
}
