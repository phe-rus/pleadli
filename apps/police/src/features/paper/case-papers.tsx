import { entityTypes, useAttachmentDataUrl, useAttachments, type EntityType } from '@/features/attachments'
import * as m from '@/paraglide/messages'
import { exhibitPersonName, exhibitStatusLabel, ExhibitForm, type Exhibit } from '@/features/evidence'
import { ChargeSheetForm, chargeSheetAccusedName, type ChargeSheet } from '@/features/legal-forms'
import { ChargeSheetPrintable } from '@/features/legal-forms/charge-sheet-printable'
import { StatementForm, statementPersonName, type Statement } from '@/features/statements'
import { format } from '@/lib/date'
import { PaperField, SignatureLine } from '@pleadli/paper'
import { SignHere, useMakerSignature, useSaveMakerSignature, useSignature } from '@/features/signature'
import { useMe } from '@/features/session/queries'
import { RichTextPreview } from '@pleadli/rich-text'
import { RecordPaper } from './record-paper'

/** A statement as it is signed: who made it, when, the words, and both signatures. */
export function StatementPaper({ statement }: { statement: Statement }) {
  const maker = statementPersonName(statement)
  const { data: me } = useMe()
  const { data: makerSignature } = useMakerSignature(statement.id)
  const saveMaker = useSaveMakerSignature(statement.id)
  // The recording officer's own signature shows on their line when they are the one looking, never on another officer's say-so.
  const { data: officerSignature } = useSignature(me?.officerId && me.officerId === statement.officerId ? me.officerId : undefined)
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
        <div className="flex flex-col">
          <SignatureLine name={maker} caption={m["paper.police.maker"]()} image={makerSignature} />
          <SignHere name={maker} label={makerSignature ? m["signature.change"]() : m["signature.take"]()} onSigned={(png) => saveMaker.mutateAsync(png)} />
        </div>
        <SignatureLine name={statement.officerName} caption={m["paper.police.recorded_by"]()} image={officerSignature} />
      </section>
    </RecordPaper>
  )
}

/** The photographs attached to a record, shown on its paper as they print. */
export function Photographs({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const { data } = useAttachments(entityType, entityId)
  const photos = (data ?? []).filter((a) => a.mimeType.startsWith('image/'))
  if (!photos.length) return null
  return (
    <section className="mt-6 grid grid-cols-2 gap-3">
      {photos.map((p) => (
        <Photo key={p.id} id={p.id} name={p.fileName} />
      ))}
    </section>
  )
}

function Photo({ id, name }: { id: string; name: string }) {
  const { data: src } = useAttachmentDataUrl(id)
  return src ? (
    <figure className="m-0">
      <img src={src} alt={name} className="w-full border border-black/20 object-contain" />
      <figcaption className="mt-1 text-[0.7rem]">{name}</figcaption>
    </figure>
  ) : null
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
      <Photographs entityType={entityTypes.exhibit} entityId={exhibit.id} />
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
