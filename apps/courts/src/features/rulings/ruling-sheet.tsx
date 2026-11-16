import { RichTextPreview } from '@pleadli/rich-text'
import type { Ruling, RulingContent } from './schema'

/** A delivered decision as a sheet of paper: the court, the case, the title, the
 * text exactly as it was delivered, the date and the signatory. It draws the
 * stored content and nothing else, so what is read is what is printed and what
 * was hashed. */
export function RulingSheet({ ruling }: { ruling: Ruling }) {
  if (!ruling.content) return null
  return <RulingPaper content={ruling.content} reference={ruling.reference} />
}

export function RulingPaper({ content, reference, draft = false }: { content: RulingContent; reference?: string | null; draft?: boolean }) {

  return (
    <div className="paper mx-auto w-full max-w-[210mm] p-[16mm] text-sm leading-relaxed" data-ruling-sheet data-document-paper>
      {draft && <p className="mb-6 border-b border-foreground/20 pb-3 text-center text-xs font-semibold tracking-widest uppercase">Draft · Not delivered</p>}
      <header className="mb-6 text-center">
        <p className="text-xs tracking-wide uppercase">The Republic of Uganda</p>
        <p className="text-xs tracking-wide uppercase">{content.court}</p>
      </header>

      <section className="mb-6 flex flex-col items-center gap-1 text-center">
        <p>{content.caseNumber}</p>
        <p className="font-semibold">{content.caseTitle}</p>
      </section>

      <h1 className="mb-1 text-center text-base font-semibold tracking-wide uppercase">{content.heading}</h1>
      <p className="mb-4 text-center">{content.title}</p>

      {content.body ? <RichTextPreview value={content.body} /> : <p className="py-8 text-center text-muted-foreground">No decision text yet. Return to Write to begin.</p>}

      <p className="mt-6">
        {draft ? 'Working draft. Delivery date is recorded when delivered.' : `Delivered at ${content.court} on ${content.deliveredOn}.`}
      </p>

      <section className="mt-16 flex flex-col items-end">
        <div className="w-64 border-t border-foreground/60 pt-1">
          {draft && <p className="mb-1 text-xs text-muted-foreground">Proposed signatory · Not signed</p>}
          <p>{content.signatory}</p>
          {content.signatoryTitle && <p className="text-xs text-muted-foreground">{content.signatoryTitle}</p>}
        </div>
      </section>

      <footer className="paper-footer">
        {content.court} · {draft ? 'Draft · No reference assigned' : reference}
      </footer>
    </div>
  )
}
