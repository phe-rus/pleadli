import * as m from '@/paraglide/messages'
import { exhibitPersonName, exhibitStatusLabel, ExhibitForm, type Exhibit } from '@/features/evidence'
import { ChargeSheetForm, chargeSheetAccusedName, type ChargeSheet } from '@/features/legal-forms'
import { ChargeSheetPrintable } from '@/features/legal-forms/charge-sheet-printable'
import { StatementForm, statementPersonName, type Statement } from '@/features/statements'
import { format } from '@/lib/date'
import { PaperField, SignatureLine } from '@pleadli/paper'
import { RichTextPreview } from '@pleadli/rich-text'
import { RecordPaper } from './record-paper'

/** A statement as it is signed: who made it, when, the words, and both signatures. */
export function StatementPaper({ statement }: { statement: Statement }) {
  const maker = statementPersonName(statement)
  return (
    <RecordPaper
      entityType="statement"
      entityId={statement.id}
      reference={statement.caseReference}
      title={m["paper.police.statement_title"]()}
      subtitle={statement.caseReference}
      details={[
        ...(statement.caseReference ? [{ label: m["paper.police.case"](), value: statement.caseReference, copy: statement.caseReference }] : []),
        { label: m["paper.police.made_by"](), value: maker },
        { label: m["paper.police.date"](), value: format(statement.givenAt, 'PPp') },
        ...(statement.officerName ? [{ label: m["paper.police.recorded_by"](), value: statement.officerName }] : []),
      ]}
      events={[{ at: statement.givenAt, label: m["paper.police.statement_title"](), by: statement.officerName }]}
      edit={(done) => <StatementForm key={statement.id} statement={statement} onSuccess={done} />}
    >
      <section className="mb-5 flex flex-col gap-0.5">
        <PaperField label={m["paper.police.made_by"]()}>{maker}</PaperField>
        <PaperField label={m["paper.police.date"]()}>{format(statement.givenAt, 'PPPPp')}</PaperField>
      </section>
      <RichTextPreview value={statement.content} className="[&_p]:mb-3" />
      <section className="mt-12 flex flex-wrap justify-between gap-8">
        <SignatureLine name={maker} caption={m["paper.police.maker"]()} />
        <SignatureLine name={statement.officerName} caption={m["paper.police.recorded_by"]()} />
      </section>
    </RecordPaper>
  )
}

/** An exhibit's entry in the exhibit register: what it is, its mark, where it came from and where it is kept. */
export function ExhibitPaper({ exhibit }: { exhibit: Exhibit }) {
  const from = exhibitPersonName(exhibit)
  return (
    <RecordPaper
      entityType="exhibit"
      entityId={exhibit.id}
      reference={exhibit.identificationMark ?? exhibit.caseReference}
      title={m["paper.police.exhibit_title"]()}
      subtitle={exhibit.caseReference}
      details={[
        ...(exhibit.identificationMark ? [{ label: m["paper.detail.reference"](), value: exhibit.identificationMark, copy: exhibit.identificationMark }] : []),
        ...(exhibit.caseReference ? [{ label: m["paper.police.case"](), value: exhibit.caseReference }] : []),
        { label: m["paper.police.recovered"](), value: format(exhibit.recoveredAt, 'PPp') },
        { label: m["paper.police.status"](), value: exhibitStatusLabel(exhibit.status) },
      ]}
      events={[{ at: exhibit.recoveredAt, label: m["paper.police.recovered"](), by: exhibit.receivingOfficerName }]}
      edit={(done) => <ExhibitForm key={exhibit.id} exhibit={exhibit} onSuccess={done} />}
    >
      <section className="flex flex-col gap-0.5">
        <p className="mb-3">{exhibit.description}</p>
        {exhibit.identificationMark && <PaperField label={m["paper.detail.reference"]()}>{exhibit.identificationMark}</PaperField>}
        <PaperField label={m["paper.police.recovered"]()}>{`${format(exhibit.recoveredAt, 'PPp')}${exhibit.recoveredFromLocation ? `, ${exhibit.recoveredFromLocation}` : ''}`}</PaperField>
        {from && <PaperField label={m["exhibits_page.from_person"]()}>{from}</PaperField>}
        {exhibit.handedOverBy && <PaperField label={m["paper.police.handed_over_by"]()}>{exhibit.handedOverBy}</PaperField>}
        {exhibit.witnesses && <PaperField label={m["paper.police.witnesses"]()}>{exhibit.witnesses}</PaperField>}
        {exhibit.storageLocation && <PaperField label={m["paper.police.stored_at"]()}>{exhibit.storageLocation}</PaperField>}
        <PaperField label={m["paper.police.status"]()}>{exhibitStatusLabel(exhibit.status)}</PaperField>
      </section>
      {exhibit.notes && <p className="mt-4 whitespace-pre-wrap">{exhibit.notes}</p>}
      <section className="mt-12 flex justify-end">
        <SignatureLine name={exhibit.receivingOfficerName} caption={m["paper.police.recorded_by"]()} />
      </section>
    </RecordPaper>
  )
}

/** The charge sheet, as it goes to court. */
export function ChargeSheetPaper({ chargeSheet }: { chargeSheet: ChargeSheet }) {
  return (
    <RecordPaper
      entityType="charge_sheet"
      entityId={chargeSheet.id}
      reference={chargeSheet.caseReference}
      title={m["paper.police.charge_sheet_title"]()}
      details={[
        { label: m["paper.police.case"](), value: chargeSheet.caseReference, copy: chargeSheet.caseReference },
        ...(chargeSheetAccusedName(chargeSheet) ? [{ label: m["legal_page.accused"](), value: chargeSheetAccusedName(chargeSheet)! }] : []),
        { label: m["paper.police.date"](), value: format(chargeSheet.chargedAt, 'PPP') },
        ...(chargeSheet.officerName ? [{ label: m["paper.police.made_by"](), value: chargeSheet.officerName }] : []),
      ]}
      events={[{ at: chargeSheet.chargedAt, label: m["paper.police.charge_sheet_title"](), by: chargeSheet.officerName }]}
      edit={(done) => <ChargeSheetForm key={chargeSheet.id} chargeSheet={chargeSheet} onSuccess={done} />}
    >
      <ChargeSheetPrintable chargeSheet={chargeSheet} bare />
    </RecordPaper>
  )
}
