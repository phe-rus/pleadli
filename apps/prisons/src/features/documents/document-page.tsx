import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { format } from 'date-fns/format'
import { DischargeCertificate } from './discharge-certificate'
import { useIssueDocument, useIssuedDocument } from './queries'
import { ReceptionRecord } from './reception-record'
import { documentKindLabel, isDocumentKind, type DocumentKind } from './schema'
import { TransferDossier } from './transfer-dossier'
import { m } from '@/paraglide/messages'

/** A document open as a tab: the sheet as it will print, and one button that
 * issues it (or records a reprint) and opens the print dialog. Printing is what
 * numbers a document, so nothing is numbered that was only looked at. */
export function DocumentPage({ kind, recordId }: { kind: string; recordId: string }) {
  if (!isDocumentKind(kind)) return <div className="page"><h1>{m.documents_not_a_document()}</h1><p>{m.documents_that_kind_of_document_is_not()}</p></div>
  return <Document kind={kind} recordId={recordId} />
}

function Document({ kind, recordId }: { kind: DocumentKind; recordId: string }) {
  const { data: issued } = useIssuedDocument(kind, recordId)
  const issue = useIssueDocument()

  const print = async () => {
    try {
      await issue.mutateAsync({ kind, recordId })
      // Two frames: the number and any "Reprint" marker are on the sheet before
      // the print dialog reads it.
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
    } catch (error) {
      t.error(m.documents_could_not_issue_the_document(), { description: error instanceof ApiError ? error.message : m.documents_please_try_again() })
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6 print:p-0">
      <div className="mx-auto flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
        <p>
          {issued
            ? issued.reprints === 0
              ? m.documents_issued_as_once({ number: issued.number, date: format(issued.issuedAt, 'd MMM yyyy') })
              : m.documents_issued_as({ number: issued.number, date: format(issued.issuedAt, 'd MMM yyyy'), count: issued.reprints + 1 })
            : m.documents_not_issued_yet_it_is_numbered()}
        </p>
        <Button onClick={print} disabled={issue.isPending}>
          {issued ? m.documents_print_a_copy() : m.documents_print({ kind: documentKindLabel[kind].toLowerCase() })}
        </Button>
      </div>
      {kind === 'reception_record' && <ReceptionRecord prisonerId={recordId} issued={issued} />}
      {kind === 'discharge_certificate' && <DischargeCertificate prisonerId={recordId} issued={issued} />}
      {kind === 'transfer_dossier' && <TransferDossier transferId={recordId} issued={issued} />}
    </div>
  )
}
