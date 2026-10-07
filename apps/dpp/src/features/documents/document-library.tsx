import { formatDate } from '@/lib/dates'
import { EmptyNote, Planned } from '@/components/planned'
import { decisionActs, decisionTypeLabel, useDecisions } from '@/features/decisions'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Segmented } from '@pleadli/ui/segmented'
import { File02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useDocuments } from './queries'
import { PrepareDocumentButton } from './prepare-button'
import { decisionDocumentKind, documentKindLabel, type DocumentRecord } from './schema'
import * as m from '@/paraglide/messages'

/** A document drawn small, as Pages shows one in its browser: an A4 page
 * with the crest, the title and a few lines, the QR corner once issued. */
function Thumbnail({ doc }: { doc: DocumentRecord }) {
  const issued = doc.status === 'issued'
  return (
    <Link to="/documents/$documentId" params={{ documentId: doc.id }} className="group flex min-w-0 flex-col gap-2 text-foreground no-underline">
      <div className="relative flex aspect-[210/297] w-full flex-col items-center gap-1.5 overflow-hidden rounded-md bg-white p-[9%] shadow-sm ring-1 ring-black/10 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md">
        <span className="mb-1 size-[16%] rounded-full bg-zinc-200" />
        <span className="h-[2.2%] w-[60%] rounded-sm bg-zinc-300" />
        <span className="mb-[6%] line-clamp-2 text-center font-serif text-[0.5625rem] leading-tight font-bold text-zinc-800 uppercase">{doc.title}</span>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="h-[1.6%] rounded-sm bg-zinc-200" style={{ width: `${i % 3 === 2 ? 70 : 100}%` }} />
        ))}
        {issued ? <span className="absolute right-[9%] bottom-[6%] size-[14%] rounded-[2px] bg-[repeating-conic-gradient(#27272a_0_25%,#fff_0_50%)] bg-[length:25%_25%]" /> : <span className="absolute bottom-[6%] left-[9%] font-serif text-[0.5rem] font-bold tracking-wider text-amber-600">{m["doc.draft"]().toUpperCase()}</span>}
        {doc.integrity === 'altered' && <span className="absolute inset-x-0 top-0 bg-destructive py-0.5 text-center text-[0.5625rem] font-semibold text-white">{m["doc.altered"]()}</span>}
      </div>
      <div className="flex min-w-0 flex-col px-0.5">
        <span className="truncate text-[0.8125rem] font-medium">{doc.title}</span>
        <span className="truncate text-xs text-muted-foreground">{doc.reference ?? doc.fileTitle}</span>
        <span className="truncate text-xs text-muted-foreground">{issued ? m["doc.issued_on"]({ date: formatDate(doc.issuedAt ?? doc.preparedAt) }) : m["interchange.out.prepared"]({ date: formatDate(doc.preparedAt) })}</span>
      </div>
    </Link>
  )
}

type Filter = 'all' | 'draft' | 'issued'

/** The documents of one file, or of the whole installation, as a library of
 * papers: what a decision is waiting to have prepared, then every document as
 * its page, filtered to drafts or issued with one switch. */
export function DocumentLibrary({ fileId }: { fileId?: string }) {
  const { data: documents } = useDocuments(fileId)
  const { data: allDecisions } = useDecisions()
  const [filter, setFilter] = useState<Filter>('all')
  const decisions = fileId ? allDecisions.filter((d) => d.prosecutionFileId === fileId) : allDecisions

  const ready = decisionActs(decisions.filter((d) => decisionDocumentKind(d.decisionType)))
    .map((act) => ({ ...act, kind: decisionDocumentKind(act.decisions[0].decisionType)! }))
    .filter((act) => !documents.some((doc) => doc.kind === act.kind && act.decisions.some((d) => d.id === doc.sourceDecisionId)))
  const shown = documents.filter((d) => filter === 'all' || d.status === filter)
  const drafts = documents.filter((d) => d.status === 'draft').length

  return (
    <div className="flex flex-col gap-8">
      {ready.length > 0 && (
        <Group title={m["doc.ready"]()}>
          {ready.map((act) => (
            <GroupRow
              key={act.key}
              label={documentKindLabel(act.kind)}
              detail={`${m["doc.from_decision"]({ decision: decisionTypeLabel(act.decisions[0].decisionType), date: formatDate(act.decisions[0].decidedAt) })}${'fileTitle' in act.decisions[0] ? ` · ${(act.decisions[0] as { fileTitle: string }).fileTitle}` : ''}`}
              value={<PrepareDocumentButton decisionId={act.decisions[0].id} />}
            />
          ))}
        </Group>
      )}

      {documents.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={File02Icon} />}>{m["doc.none_prepared"]()}</EmptyNote>
      ) : (
        <section className="flex flex-col gap-4">
          <Segmented
            label={m["nav.item.documents"]()}
            value={filter}
            onChange={setFilter}
            className="self-start"
            items={[
              { value: 'all', label: m["doc.filter.all"]() },
              { value: 'draft', label: m["doc.filter.drafts"](), count: drafts },
              { value: 'issued', label: m["doc.filter.issued"]() },
            ]}
          />
          {shown.length === 0 ? (
            <EmptyNote>{m["doc.filter.none"]()}</EmptyNote>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-5 gap-y-6">
              {shown.map((doc) => (
                <Thumbnail key={doc.id} doc={doc} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

/** For a decision that produces a document: open it if prepared, else prepare it. */
export function DecisionDocumentAction({ actDecisionIds, documents, kind }: { actDecisionIds: string[]; documents: DocumentRecord[]; kind: string }) {
  const doc = documents.find((d) => d.kind === kind && d.sourceDecisionId !== null && actDecisionIds.includes(d.sourceDecisionId))
  if (doc) {
    return (
      <Link to="/documents/$documentId" params={{ documentId: doc.id }} className="text-primary">
        {m["doc.open_kind"]({ kind: documentKindLabel(kind) })}
      </Link>
    )
  }
  return <PrepareDocumentButton decisionId={actDecisionIds[0]} label={m["doc.prepare_kind"]({ kind: documentKindLabel(kind) })} />
}

export { Planned }
