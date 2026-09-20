import { facilityProfileOptions } from '@/features/facility'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns/format'
import type { ReactNode } from 'react'
import { documentKindLabel, type DocumentKind, type IssuedDocument } from './schema'
import { m } from '@/paraglide/messages'

export type Attestation = { label: string; name?: string | null }

/** A titled part of a document. */
export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 break-inside-avoid">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

/** Label and value rows, as a table: the same look on screen and on paper. */
export function DocFacts({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  const shown = rows.filter(([, value]) => value != null && value !== '')
  return (
    <table className="w-full">
      <tbody>
        {shown.map(([label, value]) => (
          <tr key={label}>
            <td className="w-44 align-top text-muted-foreground">{label}</td>
            <td className="align-top">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * One frame for every printed document: the facility's identity, the
 * document's number and date, the body, the attestation areas, and a footer
 * with who issued it and how to verify it. A reprint says so. Before the
 * first print there is no number, and the frame says the number is given on
 * printing rather than showing a made-up one.
 *
 * The frame is a sheet of paper on screen (always light, whatever the theme)
 * and the whole page when printed.
 */
export function PrintFrame({
  kind,
  issued,
  attestations,
  children,
}: {
  kind: DocumentKind
  issued: IssuedDocument | null | undefined
  attestations: readonly Attestation[]
  children: ReactNode
}) {
  const { data: facility } = useQuery({ ...facilityProfileOptions(), retry: false })
  const place = [facility?.location, facility?.region, facility?.country].filter(Boolean).join(', ')
  const date = issued ? new Date(issued.issuedAt) : new Date()

  return (
    <article className="paper mx-auto flex w-full max-w-[210mm] flex-col gap-6 p-10 print:table print:max-w-none print:p-0">
      {/* On paper the article is a table so the footer, a table footer group, repeats
          at the foot of every page and the body never runs under it. */}
      <div className="paper-body flex flex-col gap-6 print:table-row-group">
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div className="flex flex-col gap-1">
          <h2 className="m-0">{facility?.name?.trim() || m.documents_pleadli_prisons()}</h2>
          <p>{[facility?.facilityNumber, place].filter(Boolean).join(' · ')}</p>
        </div>
        <table className="text-right">
          <tbody>
            <tr>
              <td className="pr-3 text-muted-foreground">{m.documents_number()}</td>
              <td>{issued ? <strong>{issued.number}</strong> : <em>{m.documents_given_when_printed()}</em>}</td>
            </tr>
            <tr>
              <td className="pr-3 text-muted-foreground">{m.documents_date()}</td>
              <td>{format(date, 'd MMMM yyyy')}</td>
            </tr>
            {issued && issued.reprints > 0 && (
              <tr>
                <td className="pr-3 text-muted-foreground">{m.documents_copy()}</td>
                <td>
                  <strong>{m.documents_reprint({ reprints: issued.reprints })}</strong>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </header>

      <h1 className="m-0">{documentKindLabel[kind]}</h1>

      <div className="flex flex-col gap-6">{children}</div>

      <section className="mt-4 grid grid-cols-1 gap-x-10 gap-y-8 break-inside-avoid sm:grid-cols-2" aria-label={m.documents_signatures()}>
        {attestations.map((item) => (
          <div key={item.label} className="flex flex-col gap-1 pt-8">
            <div className="border-t border-black" />
            <p>
              {item.label}
              {item.name ? `: ${item.name}` : ''}
            </p>
            <p>{m.documents_date()}</p>
          </div>
        ))}
      </section>
      </div>

      <footer className="paper-footer mt-6 flex flex-col gap-0.5 border-t border-black/60 pt-2 print:table-footer-group">
        {issued ? (
          <p>
            {m.documents_issued_by({ issuedByName: issued.issuedByName })}{issued.issuedByBadge ? m.documents_badge({ issuedByBadge: issued.issuedByBadge }) : ''} {m.documents_on_verification_it_can_be_checked({ issuedAt: format(issued.issuedAt, 'd MMM yyyy, HH:mm'), verification: issued.verification })}</p>
        ) : (
          <p>{m.documents_not_yet_issued_it_is_numbered()}</p>
        )}
      </footer>
    </article>
  )
}
