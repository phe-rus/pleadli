import type { Order } from './schema'

/** An issued order as a sheet of paper: the court, the case, the wording as it
 * was rendered when it was issued, the date and the signatory. It draws the
 * stored content and nothing else, so what is read is what is printed and what
 * was hashed. */
export function OrderSheet({ order }: { order: Order }) {
  const content = order.content
  if (!content) return null

  return (
    <div className="paper mx-auto w-full max-w-[210mm] p-[16mm] text-sm leading-relaxed" data-order-sheet>
      <header className="mb-6 text-center">
        <p className="text-xs tracking-wide uppercase">The Republic of Uganda</p>
        <p className="text-xs tracking-wide uppercase">{content.court}</p>
      </header>

      <section className="mb-6 flex flex-col items-center gap-1 text-center">
        <p>{content.caseNumber}</p>
        <p className="font-semibold">{content.caseTitle}</p>
      </section>

      <h1 className="mb-4 text-center text-base font-semibold tracking-wide uppercase">{content.heading}</h1>

      {content.paragraphs.map((paragraph, index) => (
        <p key={index} className="mb-3 whitespace-pre-wrap">
          {paragraph}
        </p>
      ))}

      <p className="mt-6">Dated at {content.court} this {content.date}.</p>

      <section className="mt-16 flex flex-col items-end">
        <div className="w-64 border-t border-foreground/60 pt-1">
          <p>{content.signatory}</p>
          {content.signatoryTitle && <p className="text-xs text-muted-foreground">{content.signatoryTitle}</p>}
        </div>
      </section>

      <footer className="paper-footer">
        {content.court} · {order.reference}
      </footer>
    </div>
  )
}
