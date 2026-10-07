import { DocumentView } from '@/components/document-viewer'
import { attachmentsOptions, openAttachment, type Attachment } from '@/features/attachments'
import { formatFileSize } from '@/features/attachments/schema'
import type { Charge } from '@/features/charges/schema'
import { evidenceCategoryLabel } from '@/features/evidence'
import type { EvidenceItem } from '@/features/evidence/schema'
import type { ProsecutionFile } from '@/features/prosecution-files/schema'
import type { Statement } from '@/features/statements/schema'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { Attachment01Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PaperField, PaperPage, SignatureLine, type PaperLink } from '@pleadli/paper'
import { RichTextPreview } from '@pleadli/rich-text'
import { Button } from '@pleadli/ui/button'
import { useQuery } from '@tanstack/react-query'

/** The numbers the paper belongs to, as a court caption prints the numbers a case arises from. */
function FileRefs({ file }: { file: ProsecutionFile }) {
  const refs = [
    file.policeStation && `${m["paper.refs.station"]()}: ${file.policeStation}`,
    file.policeReference && `${m["paper.refs.police"]()}: ${file.policeReference}`,
    file.odppRegistrationNumber && `${m["paper.refs.office"]()}: ${file.odppRegistrationNumber}`,
    file.courtCaseNumber && `${m["paper.refs.court"]()}: ${file.courtCaseNumber}`,
  ].filter(Boolean)
  return (
    <header className="mb-6 flex flex-col items-center gap-0.5 text-center">
      <p className="font-semibold uppercase">{file.title}</p>
      {refs.length > 0 && <p className="text-xs">{refs.join(' · ')}</p>}
    </header>
  )
}

function statementTitle(role: string) {
  const titles: Record<string, () => string> = {
    witness: m["paper.statement.title.witness"],
    accused: m["paper.statement.title.accused"],
    arresting_officer: m["paper.statement.title.arresting_officer"],
    investigating_officer: m["paper.statement.title.investigating_officer"],
    complainant: m["paper.statement.title.complainant"],
  }
  return (titles[role] ?? m["paper.statement.title.witness"])()
}

const hasText = (rich: string | null) => !!rich && rich.replace(/<[^>]+>|"type":"(doc|paragraph)"|[{}[\],":]|content|text/g, '').trim().length > 0

export type PaperLinks = { related?: PaperLink[]; citedBy?: PaperLink[] }

export function StatementPaper({ file, statement, links }: { file: ProsecutionFile; statement: Statement; links?: PaperLinks }) {
  const name = [statement.personFirstName, statement.personOtherNames, statement.personLastName].filter(Boolean).join(' ')
  const reference = file.policeReference ?? file.odppRegistrationNumber
  return (
    <PaperPage
      entityType="statement"
      entityId={statement.id}
      reference={reference}
      title={statementTitle(statement.statementRole)}
      head={<FileRefs file={file} />}
      {...links}
      details={[
        ...(reference ? [{ label: m["paper.detail.reference"](), value: reference, copy: reference }] : []),
        { label: m["paper.detail.file"](), value: file.title },
        { label: m["paper.detail.kind"](), value: statementTitle(statement.statementRole) },
        { label: m["paper.detail.made_by"](), value: name },
        { label: m["paper.detail.date"](), value: formatDate(statement.givenAt, 'long') },
        { label: m["paper.detail.status"](), value: m["paper.detail.received"]() },
      ]}
    >
      <section className="mb-5 flex flex-col gap-0.5">
        <PaperField label={m["paper.statement.name"]()}>{name}</PaperField>
        <PaperField label={m["paper.statement.made_on"]()}>{formatDate(statement.givenAt, 'datetime')}</PaperField>
        {statement.sourceNote && <PaperField label={m["paper.statement.source"]()}>{statement.sourceNote}</PaperField>}
      </section>
      {hasText(statement.content) ? <RichTextPreview className="[&_p]:mb-3" value={statement.content} /> : <p className="italic">{m["paper.statement.no_text"]()}</p>}
      <section className="mt-12 flex flex-wrap justify-between gap-8">
        <SignatureLine name={name} caption={m["paper.statement.maker"]()} />
        <SignatureLine caption={m["paper.statement.recorder"]()} />
      </section>
    </PaperPage>
  )
}

export function EvidencePaper({ file, item, links }: { file: ProsecutionFile; item: EvidenceItem; links?: PaperLinks }) {
  const reference = item.identificationMark ?? file.policeReference
  return (
    <PaperPage
      entityType="evidence_item"
      entityId={item.id}
      reference={reference}
      title={m["paper.evidence.title"]()}
      head={<FileRefs file={file} />}
      {...links}
      details={[
        ...(reference ? [{ label: m["paper.detail.reference"](), value: reference, copy: reference }] : []),
        { label: m["paper.detail.file"](), value: file.title },
        { label: m["paper.detail.kind"](), value: evidenceCategoryLabel(item.category) },
        { label: m["paper.detail.status"](), value: m["paper.detail.received"]() },
      ]}
    >
      <section className="mb-5 flex flex-col gap-0.5">
        <PaperField label={m["paper.evidence.category"]()}>{evidenceCategoryLabel(item.category)}</PaperField>
        {item.identificationMark && <PaperField label={m["paper.evidence.mark"]()}>{item.identificationMark}</PaperField>}
        {item.sourceNote && <PaperField label={m["paper.statement.source"]()}>{item.sourceNote}</PaperField>}
      </section>
      {hasText(item.description) && (
        <>
          <h2 className="mb-1 text-xs font-semibold uppercase">{m["paper.evidence.description"]()}</h2>
          <RichTextPreview className="[&_p]:mb-3" value={item.description} />
        </>
      )}
    </PaperPage>
  )
}

/** Police's proposed charges laid out as counts, the way a charge sheet sets them. */
export function ChargesPaper({ file, charges, links }: { file: ProsecutionFile; charges: Charge[]; links?: PaperLinks }) {
  const reference = file.policeReference ?? file.odppRegistrationNumber
  return (
    <PaperPage
      entityType="proposed_charges"
      entityId={file.id}
      reference={reference}
      title={m["paper.charges.title"]()}
      head={<FileRefs file={file} />}
      {...links}
      details={[
        ...(reference ? [{ label: m["paper.detail.reference"](), value: reference, copy: reference }] : []),
        { label: m["paper.detail.file"](), value: file.title },
        { label: m["paper.detail.counts"](), value: String(charges.length) },
        { label: m["paper.detail.status"](), value: m["paper.detail.received"]() },
      ]}
    >
      {charges.map((c, i) => (
        <section key={c.id} className="mb-6">
          <h2 className="mb-1 text-xs font-semibold uppercase underline">{m["paper.charges.count"]({ n: String(i + 1) })}</h2>
          <p className="text-xs font-semibold uppercase">{m["paper.charges.statement"]()}</p>
          <p className="mb-2">
            {c.offence}
            {c.statutorySection ? `, ${c.statutorySection}` : ''}
          </p>
          {hasText(c.particulars) && (
            <>
              <p className="text-xs font-semibold uppercase">{m["paper.charges.particulars"]()}</p>
              <RichTextPreview className="[&_p]:mb-3" value={c.particulars} />
            </>
          )}
        </section>
      ))}
    </PaperPage>
  )
}

const previewable = (a: Attachment) => a.mimeType.startsWith('image/') || a.mimeType === 'application/pdf'

/** The scans, photos and files behind a paper, shown under it: PDFs and pictures in place, anything else opened in its own program. */
export function AttachedPapers({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data: attachments = [] } = useQuery(attachmentsOptions(entityType, entityId))
  if (attachments.length === 0) return null
  return (
    <section className="mx-auto flex w-full max-w-[210mm] flex-col gap-3">
      <h3 className="text-sm font-medium text-muted-foreground">{m["paper.binder.attached"]()}</h3>
      {attachments.map((a) =>
        previewable(a) ? (
          <div key={a.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">{a.fileName}</span>
              <Button size="xs" variant="ghost" onClick={() => openAttachment(a)}>
                <HugeiconsIcon icon={LinkSquare02Icon} data-icon="inline-start" />
                {m["paper.binder.open_outside"]()}
              </Button>
            </div>
            <DocumentView attachmentId={a.id} title={a.fileName} className={a.mimeType === 'application/pdf' ? 'h-[80dvh]' : 'max-h-[80dvh]'} />
          </div>
        ) : (
          <button key={a.id} type="button" onClick={() => openAttachment(a)} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/70 p-3 text-left hover:border-primary/40">
            <HugeiconsIcon icon={Attachment01Icon} className="size-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">{a.fileName}</span>
            <span className="text-xs text-muted-foreground">{formatFileSize(a.sizeBytes)}</span>
            <span className="text-xs text-primary">{m["paper.binder.open_outside"]()}</span>
          </button>
        ),
      )}
    </section>
  )
}
