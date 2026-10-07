import { useBrandLogo } from '@/features/brand'
import * as m from '@/paraglide/messages'
import { Add01Icon, Delete02Icon, SparklesIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { displayCode } from '@pleadli/paper'
import { useEffect, useRef, type ReactNode } from 'react'
import type { Block, DocumentContent, DocumentRecord } from './schema'

/** Consecutive signature blocks stand side by side, as on a charge sheet. */
function grouped(blocks: Block[]) {
  const out: ({ block: Block; index: number } | { block: Block; index: number }[])[] = []
  blocks.forEach((block, index) => {
    const last = out[out.length - 1]
    if (block.type === 'signature' && Array.isArray(last)) last.push({ block, index })
    else if (block.type === 'signature') out.push([{ block, index }])
    else out.push({ block, index })
  })
  return out
}

/** Text that is plain on paper and, on a draft, edited where it stands. */
function Editable({ value, onChange, editing, className, multiline = true, placeholder }: { value: string; onChange: (v: string) => void; editing: boolean; className?: string; multiline?: boolean; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [value, editing])
  if (!editing) return <span className={cn('whitespace-pre-wrap', className)}>{value}</span>
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(multiline ? e.target.value : e.target.value.replace(/\n/g, ' '))}
      className={cn('block w-full resize-none overflow-hidden rounded-sm bg-transparent outline-none hover:bg-primary/5 focus:bg-primary/5 focus:ring-1 focus:ring-primary/30', className)}
    />
  )
}

function Signature({ block, editing, onChange, image }: { block: Extract<Block, { type: 'signature' }>; editing: boolean; onChange: (b: Block) => void; image?: string }) {
  return (
    <div className="flex flex-1 flex-col justify-end">
      {(block.label || editing) && (
        <p className="mb-2">
          <Editable value={block.label} editing={editing} multiline={false} onChange={(label) => onChange({ ...block, label })} />
          {block.label && !editing ? ':' : ''}
        </p>
      )}
      <div className="flex h-14 items-end">{image && <img src={image} alt="" className="max-h-14 max-w-48 object-contain" />}</div>
      <p className="border-t border-foreground/60 pt-1">
        <Editable value={block.name || block.caption || ''} editing={editing} multiline={false} onChange={(name) => onChange({ ...block, name })} />
      </p>
      {block.name && block.caption && <p className="text-xs text-muted-foreground">{block.caption}</p>}
    </div>
  )
}

/**
 * A document as a sheet of A4: the crest and the country's letterhead, the
 * office, the title, the reference or DRAFT, the content, and once issued the
 * signature, the stamp and the verification code with its QR. What is read
 * is what is printed and exported. A draft can be edited in place: every
 * line is typed over where it stands, and paragraphs are added or removed.
 */
export function DocumentSheet({
  document,
  editing = false,
  onChange,
  onAssist,
  assisting,
}: {
  document: DocumentRecord
  editing?: boolean
  onChange?: (content: DocumentContent) => void
  onAssist?: (index: number) => void
  assisting?: number | null
}) {
  const { content } = document
  const logo = useBrandLogo()
  const issued = document.status === 'issued' && document.reference
  // The draft banner is in the document's own language, like the rest of the page.
  const draftBanner = { fr: 'PROJET, NON ÉMIS', sw: 'RASIMU, HAIJATOLEWA', de: 'ENTWURF, NICHT AUSGEFERTIGT', en: 'DRAFT, NOT ISSUED' }[content.lang ?? ''] ?? m["doc.draft_banner"]()
  const status = issued ? document.reference : draftBanner
  const letterhead = content.letterhead ?? []
  const set = (blocks: Block[]) => onChange?.({ ...content, blocks })
  const setBlock = (index: number, block: Block) => set(content.blocks.map((b, i) => (i === index ? block : b)))
  const remove = (index: number) => set(content.blocks.filter((_, i) => i !== index))
  const insertAfter = (index: number) => set([...content.blocks.slice(0, index + 1), { type: 'paragraph', text: '' }, ...content.blocks.slice(index + 1)])
  // The signature image goes on the signer's line: the last one with a name.
  // Lines left blank (received in court, accepted by the accused) are for
  // others to sign on paper, even when they come after it.
  const lastSignature = content.blocks.reduce((at, b, i) => (b.type === 'signature' && b.name.trim() !== '' ? i : at), -1)

  const frame = (index: number, node: ReactNode, assistable = false) =>
    editing ? (
      <div key={index} className="group/b relative -mx-8 px-8">
        {node}
        <div className="absolute top-0 right-0 flex flex-col gap-0.5 opacity-0 group-hover/b:opacity-100 print:hidden">
          {assistable && onAssist && (
            <button type="button" title={m["doc.write_with_assist"]()} onClick={() => onAssist(index)} className="cursor-pointer rounded p-1 text-primary hover:bg-primary/10">
              <HugeiconsIcon icon={SparklesIcon} className={cn('size-3.5', assisting === index && 'animate-pulse')} />
            </button>
          )}
          <button type="button" title={m["doc.add_paragraph"]()} onClick={() => insertAfter(index)} className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-secondary">
            <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
          </button>
          <button type="button" title={m["doc.remove_block"]()} onClick={() => remove(index)} className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
          </button>
        </div>
      </div>
    ) : (
      <div key={index}>{node}</div>
    )

  return (
    <div lang={content.lang} className="paper relative mx-auto w-full max-w-[210mm] p-[16mm] font-serif text-sm leading-relaxed" data-document-sheet>
      <header className="mb-6 flex flex-col items-center gap-1 text-center">
        <img src={logo} alt="" className="mb-1 size-16 object-contain" draggable={false} />
        {letterhead.map((line, i) => (
          <p key={i} className={cn('text-xs tracking-wide uppercase', i === letterhead.length - 1 && 'font-semibold')}>
            {line}
          </p>
        ))}
        {letterhead.length === 0 && <p className="text-xs tracking-wide uppercase">{content.office}</p>}
        <div className="my-2 h-px w-24 bg-foreground/40" />
        <h1 className="w-full text-base font-semibold tracking-wide uppercase">
          <Editable value={content.title} editing={editing} multiline={false} onChange={(title) => onChange?.({ ...content, title })} className="text-center" />
        </h1>
        <p className={cn('text-xs', !issued && 'font-semibold tracking-widest text-destructive/80')}>{status}</p>
      </header>

      {grouped(content.blocks).map((entry) => {
        if (Array.isArray(entry)) {
          return (
            <section key={entry[0].index} className="mt-8 flex items-end justify-between gap-10 border-t border-foreground/40 pt-4 text-xs">
              {entry.map(({ block, index }) =>
                block.type === 'signature' ? (
                  <Signature key={index} block={block} editing={editing} onChange={(b) => setBlock(index, b)} image={index === lastSignature ? content.signatureImage : undefined} />
                ) : null,
              )}
            </section>
          )
        }
        const { block, index } = entry
        switch (block.type) {
          case 'heading':
            return frame(
              index,
              <h2 className="mt-4 mb-1 text-xs font-semibold tracking-wide uppercase">
                <Editable value={block.text} editing={editing} multiline={false} onChange={(text) => setBlock(index, { ...block, text })} />
              </h2>,
            )
          case 'paragraph':
            return frame(
              index,
              <p className="mb-3">
                <Editable value={block.text} editing={editing} placeholder={m["doc.type_here"]()} onChange={(text) => setBlock(index, { ...block, text })} />
              </p>,
              true,
            )
          case 'note':
            return frame(
              index,
              <p className="mb-4 border-l-2 border-foreground/40 pl-3 italic">
                <Editable value={block.text} editing={editing} onChange={(text) => setBlock(index, { ...block, text })} />
              </p>,
            )
          case 'fields':
            return frame(
              index,
              <section className="mb-5 grid grid-cols-2 gap-x-6 gap-y-1 border-b border-foreground/40 pb-4 font-sans text-xs">
                {block.rows.map((row, r) => (
                  <div key={r} className={cn('flex gap-1', block.rows.length % 2 === 1 && r === block.rows.length - 1 && 'col-span-2')}>
                    <span className="shrink-0 text-muted-foreground">{row.label}: </span>
                    <Editable value={row.value} editing={editing} multiline={false} onChange={(value) => setBlock(index, { ...block, rows: block.rows.map((x, j) => (j === r ? { ...x, value } : x)) })} />
                  </div>
                ))}
              </section>,
            )
          case 'list':
            return frame(
              index,
              <div role="list" className="mb-4 flex flex-col gap-2">
                {block.items.map((item, i) => (
                  <div key={i} role="listitem" className="grid grid-cols-[1.5rem_1fr] gap-2">
                    <span>{block.ordered ? `${i + 1}.` : '•'}</span>
                    <div>
                      {item.title && <p className="font-semibold">{item.title}</p>}
                      <Editable value={item.text} editing={editing} onChange={(text) => setBlock(index, { ...block, items: block.items.map((x, j) => (j === i ? { ...x, text } : x)) })} />
                    </div>
                  </div>
                ))}
                {editing && (
                  <button type="button" onClick={() => setBlock(index, { ...block, items: [...block.items, { title: null, text: '' }] })} className="w-fit cursor-pointer pl-8 text-xs text-primary print:hidden">
                    {m["doc.add_item"]()}
                  </button>
                )}
              </div>,
            )
          default:
            return null
        }
      })}

      {(content.stampImage || content.verifyQr) && (
        <section className="mt-8 flex items-end justify-between gap-6">
          {content.stampImage ? <img src={content.stampImage} alt="" className="max-h-28 max-w-40 -rotate-6 object-contain opacity-90" /> : <span />}
          {content.verifyQr && (
            <div className="flex items-end gap-3 font-sans">
              <div className="text-right text-[0.625rem] leading-tight text-muted-foreground">
                <p>{content.lang === 'fr' ? 'Vérifiable auprès du parquet émetteur' : m["doc.verify_label"]()}</p>
                <p className="font-mono text-xs text-foreground">{document.reference}</p>
                <p className="font-mono text-xs text-foreground">{content.verifyCode ? displayCode(content.verifyCode) : null}</p>
              </div>
              <div className="size-20 bg-white p-1 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: content.verifyQr }} />
            </div>
          )}
        </section>
      )}

      <p className="paper-footer">
        {content.office}. {status}
      </p>
    </div>
  )
}
