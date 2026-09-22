import { RichTextPreview } from '@pleadli/rich-text'
import type { LawyerDocument } from './schema'

/** A filed document as a sheet of paper: the firm, the court and matter, the text
 * exactly as it was filed, the date and the advocate. It draws the stored content
 * and nothing else, so what is read is what is printed and what was hashed. */
export function DocumentSheet({ document }: { document: LawyerDocument }) {
  const content = document.content
  if (!content) return null

  return (
    <div className="paper mx-auto w-full max-w-[210mm] p-[16mm] text-sm leading-relaxed" data-document-sheet>
      <header className="mb-6 text-center">
        {content.firm && <p className="text-xs tracking-wide uppercase">{content.firm}</p>}
        {content.filedWith && <p className="text-xs tracking-wide uppercase">To: {content.filedWith}</p>}
      </header>

      <section className="mb-6 flex flex-col items-center gap-1 text-center">
        {content.courtNumber && <p>{content.courtNumber}</p>}
        <p className="font-semibold">{content.matterTitle}</p>
      </section>

      <h1 className="mb-1 text-center text-base font-semibold tracking-wide uppercase">{content.heading}</h1>
      <p className="mb-4 text-center">{content.title}</p>

      <RichTextPreview value={content.body} />

      <p className="mt-6">Dated this {content.filedOn}.</p>

      <section className="mt-16 flex flex-col items-end">
        <div className="w-64 border-t border-foreground/60 pt-1">
          <p>{content.advocate}</p>
          <p className="text-xs text-muted-foreground">Advocate</p>
        </div>
      </section>

      <footer className="paper-footer">
        {content.firm ?? content.advocate} · {document.reference}
      </footer>
    </div>
  )
}
