import * as m from '@/paraglide/messages'
import { RichTextPreview, richTextToPlainText } from '@pleadli/rich-text'
import type { LawyerDocument } from './schema'

/** A filed document as a sheet of paper: the practice's letterhead, the text
 * exactly as it was filed, the date, the advocate's signature and the
 * practice's stamp, who drew it and where (Advocates Act s.67), and the code
 * and QR that let anyone check a printed copy. It draws the stored content and
 * nothing else, so what is read is what is printed and what was hashed. The
 * sheet is in the court's language (the template's), not the reader's: only
 * its footer labels follow the screen. */
export function DocumentSheet({ document }: { document: LawyerDocument }) {
  const content = document.content
  if (!content) return null
  const contacts = [content.firmAddress, content.firmPhone, content.firmEmail].filter(Boolean).join(' · ')
  // A template writes its own caption and heading; a document written from a
  // blank page (and every document from before templates) gets them here.
  const captioned = richTextToPlainText(content.body).toUpperCase().includes(content.heading)

  return (
    <div className="paper mx-auto w-full max-w-[210mm] p-[16mm] text-sm leading-relaxed" data-document-sheet>
      {(content.firm || contacts) && (
        <header className="mb-6 border-b border-foreground/40 pb-3 text-center">
          {content.firm && <p className="font-semibold tracking-wide uppercase">{content.firm}</p>}
          {contacts && <p className="text-xs">{contacts}</p>}
        </header>
      )}

      {!captioned && (
        <>
          <section className="mb-6 flex flex-col items-center gap-1 text-center">
            {content.courtNumber && <p>{content.courtNumber}</p>}
            <p className="font-semibold">{content.matterTitle}</p>
          </section>
          <h1 className="mb-1 text-center text-base font-semibold tracking-wide uppercase">{content.heading}</h1>
          <p className="mb-4 text-center">{content.title}</p>
        </>
      )}

      <RichTextPreview value={content.body} />
      {!captioned && <p className="mt-6">Dated this {content.filedOn}.</p>}

      <section className="mt-12 flex items-end justify-between gap-6">
        {content.stampImage ? <img src={content.stampImage} alt="" className="h-24 w-24 object-contain opacity-90" /> : <span />}
        <div className="w-64">
          {content.signatureImage && <img src={content.signatureImage} alt="" className="mb-1 h-14 object-contain" />}
          <div className="border-t border-foreground/60 pt-1">
            <p>{content.advocate}</p>
            <p className="text-xs text-muted-foreground">Advocate{content.practisingNumber ? `, P.C. ${content.practisingNumber}` : ''}</p>
          </div>
        </div>
      </section>

      {content.drawnBy && <p className="mt-8 text-xs">Drawn and filed by: {content.drawnBy}</p>}
      {content.filedWith && <p className="text-xs">Filed with: {content.filedWith} on {content.filedOn}</p>}

      <footer className="paper-footer flex items-end justify-between gap-4">
        <span>
          {content.firm ?? content.advocate} · {document.reference}
          {content.verifyCode && (
            <>
              {' · '}
              {m["document.verify_code"]()} {content.verifyCode}
            </>
          )}
        </span>
        {content.verifyQr && <img src={`data:image/svg+xml;utf8,${encodeURIComponent(content.verifyQr)}`} alt={m["document.verify_qr"]()} className="size-16" />}
      </footer>
    </div>
  )
}
