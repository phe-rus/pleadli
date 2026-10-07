import { AttachmentsField, entityTypes } from '@/features/attachments'
import { exhibitStatusLabel } from '@/features/evidence/schema'
import type { Exhibit } from '@/features/evidence/schema'
import { ChargeSheetPrintable } from '@/features/legal-forms/charge-sheet-printable'
import { chargeSheetAccusedName, type ChargeSheet } from '@/features/legal-forms/schema'
import { StatementForm } from '@/features/statements/statement-form'
import { statementPersonName, type Statement } from '@/features/statements/schema'
import { format } from '@/lib/date'
import * as m from '@/paraglide/messages'
import { PaperField, PaperPage, SignatureLine, type PaperLink } from '@pleadli/paper'
import { RichTextPreview } from '@pleadli/rich-text'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

type Picked = { kind: 'statement' | 'exhibit' | 'charge'; id: string }

/** The case's own heading on every paper: the case reference and what it is about. */
function CaseHead({ reference, summary }: { reference: string; summary: string }) {
  return (
    <header className="mb-6 flex flex-col items-center gap-0.5 text-center">
      <p className="text-xs tracking-wide uppercase">{m["charge_sheet.force"]()}</p>
      <p className="font-semibold uppercase">{reference}</p>
      {summary && <p className="text-xs">{summary}</p>}
    </header>
  )
}

/**
 * The case as a binder of the papers the station makes: statements, exhibit
 * entries and charge sheets, each shown as its page with its tabs (detail,
 * history, related, citations), ready to print, save as Word and check by
 * code. A statement is edited here: this is where it was made.
 */
export function CaseBinder({ reference, summary, statements, exhibits, chargeSheets }: { reference: string; summary: string; statements: Statement[]; exhibits: Exhibit[]; chargeSheets: ChargeSheet[] }) {
  const all: Picked[] = [...chargeSheets.map((c) => ({ kind: 'charge' as const, id: c.id })), ...statements.map((s) => ({ kind: 'statement' as const, id: s.id })), ...exhibits.map((e) => ({ kind: 'exhibit' as const, id: e.id }))]
  const [picked, setPicked] = useState<Picked | null>(null)
  const current = picked && all.some((p) => p.kind === picked.kind && p.id === picked.id) ? picked : (all[0] ?? null)
  const head = <CaseHead reference={reference} summary={summary} />

  const link = (p: Picked, label: string, sub?: string): PaperLink => ({ key: `${p.kind}-${p.id}`, label, sub, onOpen: () => setPicked(p) })
  const statementLink = (s: Statement) => link({ kind: 'statement', id: s.id }, statementPersonName(s), format(s.givenAt, 'PP'))
  const exhibitLink = (e: Exhibit) => link({ kind: 'exhibit', id: e.id }, e.identificationMark || e.description, exhibitStatusLabel(e.status))
  const chargeLink = (c: ChargeSheet) => link({ kind: 'charge', id: c.id }, c.offence, chargeSheetAccusedName(c) ?? undefined)

  const entry = (p: Picked, label: string, sub: string) => (
    <button
      key={`${p.kind}-${p.id}`}
      type="button"
      onClick={() => setPicked(p)}
      className={cn('flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-left', current?.kind === p.kind && current.id === p.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground')}
    >
      <span className="w-full truncate text-xs font-medium">{label}</span>
      <span className="w-full truncate text-xs text-muted-foreground">{sub}</span>
    </button>
  )
  const heading = (text: string) => <h3 className="px-2 pt-2 text-xs font-medium text-muted-foreground">{text}</h3>

  if (!current) return <p className="text-xs text-muted-foreground">{m["paper.binder.empty"]()}</p>

  const statement = current.kind === 'statement' ? statements.find((s) => s.id === current.id) : undefined
  const exhibit = current.kind === 'exhibit' ? exhibits.find((e) => e.id === current.id) : undefined
  const charge = current.kind === 'charge' ? chargeSheets.find((c) => c.id === current.id) : undefined

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{m["paper.binder.title"]()}</h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr]">
        <nav aria-label={m["paper.binder.title"]()} className="flex flex-col gap-0.5 lg:sticky lg:top-4 lg:self-start">
          {chargeSheets.length > 0 && heading(m["paper.binder.charge_sheets"]())}
          {chargeSheets.map((c) => entry({ kind: 'charge', id: c.id }, c.offence, `${chargeSheetAccusedName(c) ?? '·'} · ${format(c.chargedAt, 'PP')}`))}
          {statements.length > 0 && heading(m["paper.binder.statements"]())}
          {statements.map((s) => entry({ kind: 'statement', id: s.id }, statementPersonName(s), format(s.givenAt, 'PP')))}
          {exhibits.length > 0 && heading(m["paper.binder.exhibits"]())}
          {exhibits.map((e) => entry({ kind: 'exhibit', id: e.id }, e.identificationMark || e.description, exhibitStatusLabel(e.status)))}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          {statement && (
            <>
              <PaperPage
                key={statement.id}
                entityType="statement"
                entityId={statement.id}
                reference={reference}
                title={m["paper.police.statement_title"]()}
                head={head}
                details={[
                  { label: m["paper.police.case"](), value: reference, copy: reference },
                  { label: m["paper.police.made_by"](), value: statementPersonName(statement) },
                  { label: m["paper.police.date"](), value: format(statement.givenAt, 'PPp') },
                  ...(statement.officerName ? [{ label: m["paper.police.recorded_by"](), value: statement.officerName }] : []),
                ]}
                events={[{ at: statement.givenAt, label: m["paper.police.statement_title"](), by: statement.officerName }]}
                related={[...statements.filter((s) => s.id !== statement.id && s.personId === statement.personId).map(statementLink), ...chargeSheets.map(chargeLink)]}
                citedBy={chargeSheets.filter((c) => c.particulars.includes(statement.personLastName)).map(chargeLink)}
                edit={<StatementForm statement={statement} />}
              >
                <section className="mb-5 flex flex-col gap-0.5">
                  <PaperField label={m["paper.police.made_by"]()}>{statementPersonName(statement)}</PaperField>
                  <PaperField label={m["paper.police.date"]()}>{format(statement.givenAt, 'PPp')}</PaperField>
                </section>
                <RichTextPreview value={statement.content} className="[&_p]:mb-3" />
                <section className="mt-12 flex flex-wrap justify-between gap-8">
                  <SignatureLine name={statementPersonName(statement)} caption={m["paper.police.maker"]()} />
                  <SignatureLine name={statement.officerName} caption={m["paper.police.recorded_by"]()} />
                </section>
              </PaperPage>
              <AttachmentsField entityType={entityTypes.statement} entityId={statement.id} label={m["common.files"]()} />
            </>
          )}

          {exhibit && (
            <>
              <PaperPage
                key={exhibit.id}
                entityType="exhibit"
                entityId={exhibit.id}
                reference={exhibit.identificationMark ?? reference}
                title={m["paper.police.exhibit_title"]()}
                head={head}
                details={[
                  ...(exhibit.identificationMark ? [{ label: m["paper.detail.reference"](), value: exhibit.identificationMark, copy: exhibit.identificationMark }] : []),
                  { label: m["paper.police.case"](), value: reference },
                  { label: m["paper.police.recovered"](), value: format(exhibit.recoveredAt, 'PPp') },
                  { label: m["paper.police.status"](), value: exhibitStatusLabel(exhibit.status) },
                ]}
                events={[{ at: exhibit.recoveredAt, label: m["paper.police.recovered"](), by: exhibit.receivingOfficerName }]}
                related={[...chargeSheets.map(chargeLink), ...statements.map(statementLink)]}
                citedBy={exhibit.identificationMark ? chargeSheets.filter((c) => c.particulars.includes(exhibit.identificationMark!)).map(chargeLink) : []}
              >
                <section className="flex flex-col gap-0.5">
                  <p className="mb-3">{exhibit.description}</p>
                  {exhibit.identificationMark && <PaperField label={m["paper.detail.reference"]()}>{exhibit.identificationMark}</PaperField>}
                  <PaperField label={m["paper.police.recovered"]()}>{`${format(exhibit.recoveredAt, 'PPp')}${exhibit.recoveredFromLocation ? `, ${exhibit.recoveredFromLocation}` : ''}`}</PaperField>
                  {exhibit.handedOverBy && <PaperField label={m["paper.police.handed_over_by"]()}>{exhibit.handedOverBy}</PaperField>}
                  {exhibit.witnesses && <PaperField label={m["paper.police.witnesses"]()}>{exhibit.witnesses}</PaperField>}
                  {exhibit.storageLocation && <PaperField label={m["paper.police.stored_at"]()}>{exhibit.storageLocation}</PaperField>}
                  <PaperField label={m["paper.police.status"]()}>{exhibitStatusLabel(exhibit.status)}</PaperField>
                </section>
                <section className="mt-12 flex justify-end">
                  <SignatureLine name={exhibit.receivingOfficerName} caption={m["paper.police.recorded_by"]()} />
                </section>
              </PaperPage>
              <AttachmentsField entityType={entityTypes.exhibit} entityId={exhibit.id} label={m["common.files"]()} />
            </>
          )}

          {charge && (
            <>
              <PaperPage
                key={charge.id}
                entityType="charge_sheet"
                entityId={charge.id}
                reference={charge.caseReference}
                title={m["paper.police.charge_sheet_title"]()}
                details={[
                  { label: m["paper.police.case"](), value: charge.caseReference, copy: charge.caseReference },
                  { label: m["paper.police.date"](), value: format(charge.chargedAt, 'PPP') },
                  ...(charge.stationName ? [{ label: m["paper.police.station"](), value: charge.stationName }] : []),
                  ...(charge.officerName ? [{ label: m["paper.police.made_by"](), value: charge.officerName }] : []),
                ]}
                events={[{ at: charge.chargedAt, label: m["paper.police.charge_sheet_title"](), by: charge.officerName }]}
                related={[...statements.map(statementLink), ...exhibits.map(exhibitLink), ...chargeSheets.filter((c) => c.id !== charge.id).map(chargeLink)]}
              >
                <ChargeSheetPrintable chargeSheet={charge} bare />
              </PaperPage>
              <Link to="/legal-forms/$chargeSheetId" params={{ chargeSheetId: charge.id }} className="text-xs text-primary">
                {m["paper.binder.open_full"]()}
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
