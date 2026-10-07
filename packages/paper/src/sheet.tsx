import { cn } from '@pleadli/ui/lib/utils'
import { forwardRef, type ReactNode } from 'react'
import { usePaperApp, type PaperStamp } from './context'

/** Groups of four, as the code is printed and read out. */
export function displayCode(code: string) {
  return code.match(/.{1,4}/g)?.join('-') ?? code
}

export type Party = { name: string; role: string }

/**
 * The heading every court paper in the region opens with, as on a real
 * judgment: the republic, the court, the case number, the numbers it arises
 * from, then the parties set against each other.
 */
export function Caption({ lines, number, arisingFrom, parties }: { lines: string[]; number?: string | null; arisingFrom?: string[]; parties?: Party[] }) {
  return (
    <header className="mb-6 flex flex-col items-center gap-0.5 text-center font-semibold uppercase">
      {lines.map((line, i) => (
        <p key={i} className={cn(i === 0 ? 'text-base' : 'text-sm')}>
          {line}
        </p>
      ))}
      {number && <p className="text-sm">{number}</p>}
      {arisingFrom && arisingFrom.length > 0 && <p className="text-xs font-normal normal-case">[Arising from {arisingFrom.join('; ')}]</p>}
      {parties && parties.length > 0 && (
        <div className="mt-4 flex w-full flex-col gap-1 text-sm">
          {parties.map((p, i) => (
            <div key={i} className="flex flex-col gap-1">
              {i > 0 && <p className="text-center">versus</p>}
              <p className="flex items-baseline gap-2">
                <span className="shrink-0">{p.name}</span>
                <span className="min-w-4 flex-1 border-b border-dotted border-current" />
                <span className="shrink-0">{p.role}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </header>
  )
}

/** The code and QR a paper carries once it has left the application. */
export function VerifyBlock({ stamp, reference }: { stamp: PaperStamp; reference?: string | null }) {
  const { labels } = usePaperApp()
  return (
    <section data-paper-stamp className="mt-10 flex items-end justify-end gap-3 font-sans">
      <div className="text-right text-[0.625rem] leading-tight">
        <p>{labels.verifyLine}</p>
        {reference && <p className="font-mono text-xs">{reference}</p>}
        <p className="font-mono text-xs font-semibold">{displayCode(stamp.code)}</p>
      </div>
      {stamp.qr && <div className="size-20 bg-white p-1 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: stamp.qr }} />}
    </section>
  )
}

/**
 * A sheet of A4, light whatever the theme, read on screen the way it prints.
 * `children` is the paper's wording; the verification block sits below it,
 * outside the wording it vouches for.
 */
export const PaperSheet = forwardRef<HTMLDivElement, { head?: ReactNode; title?: string | null; children: ReactNode; stamp?: PaperStamp | null; reference?: string | null; className?: string; overlay?: ReactNode }>(
  function PaperSheet({ head, title, children, stamp, reference, className, overlay }, ref) {
    return (
      <div ref={ref} className={cn('paper relative mx-auto w-full max-w-[210mm] p-[16mm] font-serif text-sm leading-relaxed', className)}>
        {overlay}
        <div data-paper-body>
          {head}
          {title && <h1 className="mb-5 text-center text-base font-semibold tracking-wide uppercase underline underline-offset-4">{title}</h1>}
          {children}
        </div>
        {stamp && <VerifyBlock stamp={stamp} reference={reference} />}
      </div>
    )
  },
)

/** A labelled line on paper: "Date: 5 January 2019". */
export function PaperField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p>
      <strong>{label}:</strong> {children}
    </p>
  )
}

/** A line to sign on, with who signs it under it. */
export function SignatureLine({ name, caption, image }: { name?: string | null; caption?: string | null; image?: string | null }) {
  return (
    <div className="flex min-w-48 flex-col justify-end text-xs">
      <div className="flex h-12 items-end">{image && <img src={image} alt="" className="max-h-12 max-w-44 object-contain" />}</div>
      <p className="border-t border-current pt-1">{name || ' '}</p>
      {caption && <p>{caption}</p>}
    </div>
  )
}
