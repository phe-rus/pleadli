import { DocumentView } from '@/components/document-viewer'
import { Createpanel } from '@/components/create-panel'
import { EmptyNote } from '@/components/planned'
import { openAttachment } from '@/features/attachments'
import { entityTypes } from '@/features/attachments/schema'
import { AttachmentsField } from '@/features/attachments'
import { ChargeForm, useChargesForFile } from '@/features/charges'
import { CommentThread } from '@/features/comments'
import { DocumentReader, useDocuments } from '@/features/documents'
import { decisionActs, decisionTypeLabel, useDecisionsForFile } from '@/features/decisions'
import { standardLabel } from '@/features/charging-review/schema'
import { useReviewsForFile } from '@/features/charging-review'
import { useDirectionsForFile } from '@/features/directions'
import { useReviewNotesForFile } from '@/features/review-notes'
import { NewDocumentButton } from '@/features/templates/new-document'
import { evidenceCategoryLabel, EvidenceForm, useEvidenceForFile } from '@/features/evidence'
import { groups, KindSelect, kindLabel, TypedEntry } from '@/features/file-index/file-index'
import type { FileItem } from '@/features/file-index/data'
import { ImportPaper } from '@/features/file-index/import-paper'
import { useConfirmFileItems, useDeleteFileItem, useFileItems, useUpdateFileItem } from '@/features/file-index/queries'
import { useJurisdiction } from '@/features/installation'
import { useFilePeople, useProsecutionFile } from '@/features/prosecution-files'
import type { ProsecutionFile } from '@/features/prosecution-files/schema'
import { StatementForm, statementRoleLabel, useStatementsForFile } from '@/features/statements'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { Add01Icon, Attachment01Icon, CheckListIcon, Delete02Icon, File02Icon, FileImportIcon, Folder01Icon, LeftToRightListNumberIcon, LegalDocument01Icon, NoteIcon, SparklesIcon, TextIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PaperView } from '@pleadli/paper'
import { Button } from '@pleadli/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pleadli/ui/dropdown-menu'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { Textarea } from '@pleadli/ui/textarea'
import { useState, type ReactNode } from 'react'
import { AttachedPapers, ChargesPaper, EvidencePaper, hasText, StatementPaper } from './material-papers'
import { DecisionPaper, FileCoverPaper, FileIndexPaper, MinuteSheetPaper, ReviewPaper } from './office-papers'

type Picked =
  | { kind: 'cover' }
  | { kind: 'index' }
  | { kind: 'minutes' }
  | { kind: 'review'; id: string }
  | { kind: 'decision'; id: string }
  | { kind: 'doc'; id: string } | { kind: 'item'; id: string } | { kind: 'charges' } | { kind: 'statement'; id: string } | { kind: 'evidence'; id: string }

const same = (a: Picked | null, b: Picked) => !!a && a.kind === b.kind && ('id' in b ? 'id' in a && a.id === b.id : true)

/** A typed entry of the file shown as its paper; Edit changes its title and wording. */
function TypedPaper({ item, file }: { item: FileItem; file: ProsecutionFile }) {
  const update = useUpdateFileItem(item.prosecutionFileId)
  const [title, setTitle] = useState(item.title)
  const [body, setBody] = useState(item.body ?? '')
  return (
    <PaperView
      entityType="file_item"
      entityId={item.id}
      reference={file.odppRegistrationNumber ?? file.policeReference}
      title={item.title}
      edit={
        <form
          className="mx-auto flex w-full max-w-[210mm] flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            update.mutate({ id: item.id, change: { title: title.trim() || item.title, body: body.trim() || null, confirm: true } })
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label={m["index.title"]()} />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[50dvh] font-serif" />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={update.isPending}>
              {m["common.save_changes"]()}
            </Button>
          </div>
        </form>
      }
    >
      <p className="mb-4 text-xs">{[kindLabel(item.kind), item.documentDate ? formatDate(item.documentDate, 'long') : null].filter(Boolean).join(' · ')}</p>
      <div className="whitespace-pre-wrap">{item.body || m["index.no_text"]()}</div>
    </PaperView>
  )
}

/** A scanned entry: the scan itself at its page, or the text read from it. */
function ScannedPaper({ item }: { item: FileItem }) {
  const [showText, setShowText] = useState(false)
  const update = useUpdateFileItem(item.prosecutionFileId)
  const remove = useDeleteFileItem(item.prosecutionFileId)
  const unconfirmed = item.source === 'assist' && !item.confirmedAt
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <KindSelect value={item.kind} onChange={(kind) => update.mutate({ id: item.id, change: { kind, confirm: true } })} />
          {item.body && (
            <div className="flex rounded-lg bg-secondary p-0.5">
              <button type="button" onClick={() => setShowText(false)} className={cn('cursor-pointer rounded-md px-3 py-1 text-sm', !showText && 'bg-background shadow-xs')}>
                {m["index.view_scan"]()}
              </button>
              <button type="button" onClick={() => setShowText(true)} className={cn('cursor-pointer rounded-md px-3 py-1 text-sm', showText && 'bg-background shadow-xs')}>
                {m["index.view_text"]()}
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {item.attachmentId && (
            <Button size="sm" variant="ghost" onClick={() => openAttachment({ id: item.attachmentId! })}>
              {m["paper.binder.open_outside"]()}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove.mutate(item.id)}>
            <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
            {m["index.remove"]()}
          </Button>
        </div>
      </div>
      {unconfirmed && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary/5 p-3 ring-1 ring-primary/20">
          <span className="inline-flex items-center gap-2">
            <HugeiconsIcon icon={SparklesIcon} className="size-4 text-primary" />
            {m["index.placed_by_assist"]()}
          </span>
          <Button size="sm" onClick={() => update.mutate({ id: item.id, change: { confirm: true } })}>
            {m["index.confirm"]()}
          </Button>
        </div>
      )}
      {item.summary && <p className="rounded-xl bg-secondary/50 p-3">{item.summary}</p>}
      {showText ? (
        <article className="paper mx-auto w-full max-w-[210mm] p-[16mm] font-serif leading-relaxed whitespace-pre-wrap">{item.body}</article>
      ) : (
        item.attachmentId && <DocumentView attachmentId={item.attachmentId} page={item.pageFrom} title={item.title} className="h-[85dvh]" />
      )}
    </div>
  )
}

type AddPanel = 'document' | 'import' | 'statement' | 'evidence' | 'charge' | null

/** Every way a paper comes into the file, behind one button, grouped by where
 * it comes from: what this office writes, and what Police sent. */
function AddMenu({ fileId, decision, onMade, onType }: { fileId: string; decision: { id: string; decisionType: string } | null; onMade: (id: string) => void; onType: () => void }) {
  const [panel, setPanel] = useState<AddPanel>(null)
  const [dirty, setDirty] = useState(false)
  const close = () => {
    setPanel(null)
    setDirty(false)
  }
  const form = (id: AddPanel, title: string, description: string, body: ReactNode) => (
    <Createpanel open={panel === id} onOpenChange={(open) => !open && close()} isDirty={dirty} headings={{ title, description }}>
      {body}
    </Createpanel>
  )
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="icon-sm" variant="ghost" aria-label={m["paper.add.button"]()} title={m["paper.add.button"]()} className="cursor-pointer">
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" sideOffset={6} className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{m["paper.add.office"]()}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setPanel('document')}>
              <HugeiconsIcon icon={File02Icon} />
              {m["paper.add.document"]()}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onType}>
              <HugeiconsIcon icon={TextIcon} />
              {m["index.type_document"]()}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{m["paper.add.police"]()}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setPanel('import')}>
              <HugeiconsIcon icon={FileImportIcon} />
              {m["paper.add.import"]()}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPanel('statement')}>
              <HugeiconsIcon icon={NoteIcon} />
              {m["paper.add.statement"]()}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPanel('evidence')}>
              <HugeiconsIcon icon={Attachment01Icon} />
              {m["paper.add.evidence"]()}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPanel('charge')}>
              <HugeiconsIcon icon={LegalDocument01Icon} />
              {m["paper.add.charge"]()}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewDocumentButton
        fileId={fileId}
        decisionId={decision?.id ?? null}
        decisionKind={decision?.decisionType ?? null}
        trigger={false}
        open={panel === 'document'}
        onOpenChange={(open) => !open && close()}
        onMade={(id) => {
          close()
          onMade(id)
        }}
      />
      <ImportPaper fileId={fileId} trigger={false} open={panel === 'import'} onOpenChange={(open) => !open && close()} />
      {form('statement', m["material.add_statement"](), m["material.add_statement_description"](), <StatementForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />)}
      {form('evidence', m["material.add_evidence"](), m["material.add_evidence_description"](), <EvidenceForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />)}
      {form('charge', m["material.add_charge"](), m["material.add_charge_description"](), <ChargeForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />)}
    </>
  )
}

/**
 * The file as a binder of papers: what this office has prepared, the file's
 * own papers in the country's section order, and what Police sent. Choosing a
 * paper shows the paper itself, with its scans under it, ready to print.
 */
export function FileBinder({ fileId }: { fileId: string }) {
  const country = useJurisdiction()
  const { data: file } = useProsecutionFile(fileId)
  const { data: documents } = useDocuments(fileId)
  const { data: items = [] } = useFileItems(fileId)
  const { data: charges } = useChargesForFile(fileId)
  const { data: statements } = useStatementsForFile(fileId)
  const { data: evidence } = useEvidenceForFile(fileId)
  const confirm = useConfirmFileItems(fileId)
  const { data: decisions } = useDecisionsForFile(fileId)
  const lastDecision = [...decisions].sort((a, b) => b.decidedAt - a.decidedAt)[0] ?? null
  const { data: people } = useFilePeople(fileId)
  const { data: allNotes } = useReviewNotesForFile(fileId)
  const notes = allNotes.filter((n) => hasText(n.note))
  const { data: reviews } = useReviewsForFile(fileId)
  const { data: directions } = useDirectionsForFile(fileId)
  const acts = decisionActs([...decisions].sort((a, b) => a.decidedAt - b.decidedAt))
  const reviewsInOrder = [...reviews].sort((a, b) => a.startedAt - b.startedAt)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [typing, setTyping] = useState(false)

  const all: Picked[] = [
    { kind: 'cover' },
    { kind: 'index' },
    ...(notes.length ? [{ kind: 'minutes' } as const] : []),
    ...reviewsInOrder.map((r) => ({ kind: 'review', id: r.id }) as const),
    ...acts.map((a) => ({ kind: 'decision', id: a.decisions[0]!.id }) as const),
    ...documents.map((d) => ({ kind: 'doc', id: d.id }) as const),
    ...items.map((i) => ({ kind: 'item', id: i.id }) as const),
    ...(charges.length ? [{ kind: 'charges' } as const] : []),
    ...statements.map((s) => ({ kind: 'statement', id: s.id }) as const),
    ...evidence.map((e) => ({ kind: 'evidence', id: e.id }) as const),
  ]
  const current = picked && all.some((p) => same(picked, p)) ? picked : (all[0] ?? null)

  // What links papers on this file: the documents this office prepared that
  // name a person or an exhibit mark, and the papers that belong together.
  const docText = (d: (typeof documents)[number]) =>
    d.content.blocks.map((b) => ('text' in b ? b.text : 'rows' in b ? b.rows.map((r) => `${r.label} ${r.value}`).join(' ') : 'items' in b ? b.items.map((i) => i.text).join(' ') : '')).join(' ')
  const docLinks = (match: (text: string) => boolean) =>
    documents.filter((d) => match(docText(d))).map((d) => ({ key: `doc-${d.id}`, label: d.title, sub: d.reference ?? m["doc.draft"](), onOpen: () => setPicked({ kind: 'doc', id: d.id }) }))
  const allDocs = documents.map((d) => ({ key: `doc-${d.id}`, label: d.title, sub: d.reference ?? m["doc.draft"](), onOpen: () => setPicked({ kind: 'doc', id: d.id }) }))
  const chargesLink = charges.length ? [{ key: 'charges', label: m["paper.charges.title"](), sub: charges.map((c) => c.offence).join(', '), onOpen: () => setPicked({ kind: 'charges' }) }] : []
  const statementLink = (st: (typeof statements)[number]) => ({ key: `st-${st.id}`, label: `${st.personFirstName} ${st.personLastName}`, sub: `${statementRoleLabel(st.statementRole)} · ${formatDate(st.givenAt)}`, onOpen: () => setPicked({ kind: 'statement', id: st.id }) })
  const evidenceLink = (ev: (typeof evidence)[number]) => ({ key: `ev-${ev.id}`, label: ev.identificationMark || evidenceCategoryLabel(ev.category), sub: evidenceCategoryLabel(ev.category), onOpen: () => setPicked({ kind: 'evidence', id: ev.id }) })
  const names = (text: string, first: string, last: string) => text.includes(first) && text.includes(last)
  const unconfirmed = items.filter((i) => i.source === 'assist' && !i.confirmedAt).length

  const entry = (p: Picked, label: string, sub?: string | null, icon?: typeof File02Icon, flag?: ReactNode) => (
    <button
      key={`${p.kind}-${'id' in p ? p.id : ''}`}
      type="button"
      onClick={() => setPicked(p)}
      aria-current={same(current, p) ? 'true' : undefined}
      className={cn('flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left', same(current, p) ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground')}
    >
      {icon && <HugeiconsIcon icon={icon} className="mt-0.5 size-3.5 shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
      {flag}
    </button>
  )
  const heading = (text: string, code?: string | null) => (
    <h3 className="flex items-center gap-2 px-2 pt-2 text-xs font-medium text-muted-foreground">
      {code && <span className="flex size-5 items-center justify-center rounded bg-secondary text-[0.625rem] font-semibold">{code}</span>}
      {text}
    </h3>
  )

  return (
    <div className="flex flex-col gap-4">
      {typing && <TypedEntry fileId={fileId} onDone={() => setTyping(false)} />}

      {unconfirmed > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary/5 p-4 ring-1 ring-primary/20">
          <span className="inline-flex items-center gap-2">
            <HugeiconsIcon icon={SparklesIcon} className="size-4 text-primary" />
            {m["index.check_title"]({ count: unconfirmed })}
          </span>
          <Button size="sm" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
            {m["index.confirm_all"]()}
          </Button>
        </div>
      )}

      {!current || !file ? (
        <EmptyNote>{m["paper.binder.empty"]()}</EmptyNote>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_1fr]">
          <nav aria-label={m["paper.binder.papers"]()} className="flex flex-col gap-0.5 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto">
            <div className="flex items-center justify-between gap-2 px-2 pb-1">
              <span className="text-sm font-medium">
                {m["paper.binder.papers_short"]()} <span className="font-normal text-muted-foreground tabular-nums">{all.length}</span>
              </span>
              <AddMenu fileId={fileId} decision={lastDecision} onMade={(id) => setPicked({ kind: 'doc', id })} onType={() => setTyping(true)} />
            </div>
            {heading(m["paper.binder.this_file"]())}
            {entry({ kind: 'cover' }, m["paper.cover.title"](), file.title, Folder01Icon)}
            {entry({ kind: 'index' }, m["paper.index.title"](), m["paper.binder.every_paper"](), LeftToRightListNumberIcon)}
            {notes.length > 0 && entry({ kind: 'minutes' }, m["paper.minutes.title"](), (notes.length === 1 ? m["paper.binder.minutes_one"]() : m["paper.binder.minutes_count"]({ count: notes.length })), NoteIcon)}
            {(reviewsInOrder.length > 0 || acts.length > 0) && heading(m["paper.binder.decisions"]())}
            {reviewsInOrder.map((r) => entry({ kind: 'review', id: r.id }, m["paper.review.title"](), `${standardLabel(r.standard)} · ${formatDate(r.startedAt)}`, CheckListIcon))}
            {acts.map((a) => {
              const d = a.decisions[0]!
              return entry({ kind: 'decision', id: d.id }, decisionTypeLabel(d.decisionType), [d.decidedBy, formatDate(d.decidedAt)].filter(Boolean).join(' · '), CheckListIcon)
            })}
            {documents.length > 0 && (
              <>
                {heading(m["paper.binder.prepared"]())}
                {documents.map((d) => entry({ kind: 'doc', id: d.id }, d.title, d.reference ?? m["doc.draft"](), File02Icon))}
              </>
            )}
            {groups(country, items)
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.key} className="flex flex-col gap-0.5">
                  {heading(g.title, g.code)}
                  {g.items.map((i) =>
                    entry(
                      { kind: 'item', id: i.id },
                      i.title,
                      [kindLabel(i.kind), i.documentDate ? formatDate(i.documentDate) : null].filter(Boolean).join(' · '),
                      i.attachmentId ? File02Icon : TextIcon,
                      i.source === 'assist' && !i.confirmedAt ? <HugeiconsIcon icon={SparklesIcon} className="mt-0.5 size-3 shrink-0 text-primary" /> : null,
                    ),
                  )}
                </div>
              ))}
            {(charges.length > 0 || statements.length > 0 || evidence.length > 0) && heading(m["paper.binder.from_police"]())}
            {charges.length > 0 && entry({ kind: 'charges' }, m["paper.charges.title"](), charges.map((c) => c.offence).join(', '), TextIcon)}
            {statements.map((st) => entry({ kind: 'statement', id: st.id }, `${st.personFirstName} ${st.personLastName}`, `${statementRoleLabel(st.statementRole)} · ${formatDate(st.givenAt)}`, TextIcon))}
            {evidence.map((ev) => entry({ kind: 'evidence', id: ev.id }, ev.identificationMark || evidenceCategoryLabel(ev.category), evidenceCategoryLabel(ev.category), TextIcon))}
          </nav>

          <div className="flex min-w-0 flex-col gap-6">
            {current.kind === 'cover' && <FileCoverPaper file={file} people={people} charges={charges} decisions={decisions} links={{ related: [...allDocs, ...chargesLink] }} />}
            {current.kind === 'index' && <FileIndexPaper file={file} country={country} documents={documents} items={items} charges={charges} statements={statements} evidence={evidence} />}
            {current.kind === 'minutes' && <MinuteSheetPaper file={file} notes={notes} />}
            {current.kind === 'review' &&
              (() => {
                const r = reviews.find((x) => x.id === current.id)
                if (!r) return null
                const made = acts.filter((a) => a.decisions[0]!.reviewId === r.id)
                return (
                  <>
                    <ReviewPaper
                      key={r.id}
                      file={file}
                      review={r}
                      links={{ related: [...made.map((a) => ({ key: `dec-${a.key}`, label: decisionTypeLabel(a.decisions[0]!.decisionType), sub: formatDate(a.decisions[0]!.decidedAt), onOpen: () => setPicked({ kind: 'decision', id: a.decisions[0]!.id }) })), ...statements.map(statementLink), ...evidence.map(evidenceLink)] }}
                    />
                    <CommentThread entityType="charging_review" entityId={r.id} />
                  </>
                )
              })()}
            {current.kind === 'decision' &&
              (() => {
                const a = acts.find((x) => x.decisions[0]!.id === current.id)
                if (!a) return null
                const d = a.decisions[0]!
                const review = d.reviewId ? (reviews.find((r) => r.id === d.reviewId) ?? null) : null
                const madeDocs = documents.filter((doc) => doc.sourceDecisionId && a.decisions.some((x) => x.id === doc.sourceDecisionId))
                return (
                  <>
                    <DecisionPaper
                      key={d.id}
                      file={file}
                      act={a.decisions}
                      charges={charges}
                      directions={directions.filter((x) => a.decisions.some((y) => y.id === x.decisionId))}
                      review={review}
                      people={people}
                      links={{
                        related: [
                          ...madeDocs.map((doc) => ({ key: `doc-${doc.id}`, label: doc.title, sub: doc.reference ?? m["doc.draft"](), onOpen: () => setPicked({ kind: 'doc', id: doc.id }) })),
                          ...(review ? [{ key: `rev-${review.id}`, label: m["paper.review.title"](), sub: formatDate(review.startedAt), onOpen: () => setPicked({ kind: 'review', id: review.id }) }] : []),
                          ...chargesLink,
                        ],
                      }}
                    />
                    {a.decisions.map((x) => (
                      <CommentThread key={x.id} entityType="decision" entityId={x.id} />
                    ))}
                  </>
                )
              })()}
            {current.kind === 'doc' &&
              (() => {
                const d = documents.find((x) => x.id === current.id)
                const text = d ? docText(d) : ''
                return (
                  <DocumentReader
                    key={current.id}
                    id={current.id}
                    embedded
                    links={{
                      // The papers this document draws on: the statements and exhibits it names, then the rest of the file.
                      related: [
                        ...statements.filter((st) => names(text, st.personFirstName, st.personLastName)).map(statementLink),
                        ...evidence.filter((ev) => ev.identificationMark && text.includes(ev.identificationMark)).map(evidenceLink),
                        ...chargesLink,
                        ...allDocs.filter((x) => x.key !== `doc-${current.id}`),
                      ],
                    }}
                  />
                )
              })()}
            {current.kind === 'item' &&
              (() => {
                const item = items.find((i) => i.id === current.id)
                if (!item) return null
                return item.attachmentId ? <ScannedPaper key={item.id} item={item} /> : <TypedPaper key={item.id} item={item} file={file} />
              })()}
            {current.kind === 'charges' && (
              <>
                <ChargesPaper file={file} charges={charges} links={{ related: [...allDocs, ...statements.map(statementLink), ...evidence.map(evidenceLink)], citedBy: docLinks((t) => charges.some((c) => t.includes(c.offence))) }} />
                {charges.map((c) => (
                  <CommentThread key={c.id} entityType="charge" entityId={c.id} />
                ))}
              </>
            )}
            {current.kind === 'statement' &&
              (() => {
                const st = statements.find((x) => x.id === current.id)
                if (!st) return null
                return (
                  <>
                    <p className="text-sm text-muted-foreground">{m["paper.binder.received"]()}</p>
                    <StatementPaper
                      key={st.id}
                      file={file}
                      statement={st}
                      links={{
                        related: [...statements.filter((x) => x.id !== st.id && x.personId === st.personId).map(statementLink), ...chargesLink, ...allDocs],
                        citedBy: docLinks((t) => names(t, st.personFirstName, st.personLastName)),
                      }}
                    />
                    <AttachedPapers entityType={entityTypes.statement} entityId={st.id} />
                    <AttachmentsField entityType={entityTypes.statement} entityId={st.id} label={m["material.scanned"]()} />
                    <CommentThread entityType="statement" entityId={st.id} />
                  </>
                )
              })()}
            {current.kind === 'evidence' &&
              (() => {
                const ev = evidence.find((x) => x.id === current.id)
                if (!ev) return null
                return (
                  <>
                    <p className="text-sm text-muted-foreground">{m["paper.binder.received"]()}</p>
                    <EvidencePaper
                      key={ev.id}
                      file={file}
                      item={ev}
                      links={{ related: [...chargesLink, ...allDocs], citedBy: ev.identificationMark ? docLinks((t) => t.includes(ev.identificationMark!)) : [] }}
                    />
                    <AttachedPapers entityType={entityTypes.evidenceItem} entityId={ev.id} />
                    <AttachmentsField entityType={entityTypes.evidenceItem} entityId={ev.id} label={m["material.photos"]()} />
                    <CommentThread entityType="evidence_item" entityId={ev.id} />
                  </>
                )
              })()}
          </div>
        </div>
      )}
    </div>
  )
}
