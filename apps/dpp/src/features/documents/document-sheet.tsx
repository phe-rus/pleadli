import { cn } from '@pleadli/ui/lib/utils'
import type { Block, DocumentRecord } from './schema'

/** Consecutive signature blocks stand side by side, as on a charge sheet. */
function grouped(blocks: Block[]) {
  const out: (Block | Block[])[] = []
  for (const block of blocks) {
    const last = out[out.length - 1]
    if (block.type === 'signature' && Array.isArray(last)) last.push(block)
    else if (block.type === 'signature') out.push([block])
    else out.push(block)
  }
  return out
}

function Signature({ block }: { block: Extract<Block, { type: 'signature' }> }) {
  return (
    <div className="flex flex-1 flex-col justify-end">
      {block.label && <p className="mb-8">{block.label}:</p>}
      <p className={cn('border-t border-foreground/60 pt-1', !block.label && 'mt-8')}>{block.name || block.caption}</p>
      {block.name && block.caption && <p className="text-xs text-muted-foreground">{block.caption}</p>}
    </div>
  )
}

/**
 * A document as a sheet of paper: the office, the title, the reference or the
 * word DRAFT, and the content's blocks. It renders the stored content and
 * nothing else, so what is read is what is printed and exported. Layout is
 * here, in one place; the content holds only words.
 */
export function DocumentSheet({ document }: { document: DocumentRecord }) {
  const { content } = document
  const status = document.status === 'issued' && document.reference ? document.reference : 'DRAFT, not issued'

  return (
    <div className="paper mx-auto w-full max-w-[210mm] p-[16mm] text-sm leading-relaxed" data-document-sheet>
      <header className="mb-6 text-center">
        <p className="text-xs tracking-wide uppercase">{content.office}</p>
        <h1 className="text-base font-semibold tracking-wide uppercase">{content.title}</h1>
        <p className="text-xs">{status}</p>
      </header>

      {grouped(content.blocks).map((block, index) => {
        if (Array.isArray(block)) {
          return (
            <section key={index} className="mt-8 flex items-end justify-between gap-10 border-t border-foreground/40 pt-4 text-xs">
              {block.map((s, i) => (s.type === 'signature' ? <Signature key={i} block={s} /> : null))}
            </section>
          )
        }
        switch (block.type) {
          case 'heading':
            return (
              <h2 key={index} className="mt-4 mb-1 text-xs font-semibold tracking-wide uppercase">
                {block.text}
              </h2>
            )
          case 'paragraph':
            return (
              <p key={index} className="mb-3 whitespace-pre-wrap">
                {block.text}
              </p>
            )
          case 'note':
            return (
              <p key={index} className="mb-4 border-l-2 border-foreground/40 pl-3 italic">
                {block.text}
              </p>
            )
          case 'fields':
            return (
              <section key={index} className="mb-5 grid grid-cols-2 gap-x-6 gap-y-1 border-b border-foreground/40 pb-4 text-xs">
                {block.rows.map((row) => (
                  <div key={row.label} className={cn(block.rows.length % 2 === 1 && row === block.rows[block.rows.length - 1] && 'col-span-2')}>
                    <span className="text-muted-foreground">{row.label}: </span>
                    {row.value}
                  </div>
                ))}
              </section>
            )
          case 'list':
            return (
              <div key={index} role="list" className="mb-4 flex flex-col gap-2">
                {block.items.map((item, i) => (
                  <div key={i} role="listitem" className="grid grid-cols-[1.5rem_1fr] gap-2">
                    <span>{block.ordered ? `${i + 1}.` : '•'}</span>
                    <div>
                      {item.title && <p className="font-semibold">{item.title}</p>}
                      <p className="whitespace-pre-wrap">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          default:
            return null
        }
      })}

      <p className="paper-footer">
        {content.office}. {status}
      </p>
    </div>
  )
}
