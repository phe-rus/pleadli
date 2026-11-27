import * as m from '@/paraglide/messages'
import { RecordPaper } from '@/features/paper/record-paper'
import { format } from '@/lib/date'
import { PaperField, SignatureLine } from '@pleadli/paper'
import { MedicalForm } from './medical-form'
import { medicalKindLabel, medicalStatusLabel, type MedicalExam } from './schema'

export const medicalPersonName = (e: Pick<MedicalExam, 'personFirstName' | 'personLastName' | 'personOtherNames'>) =>
  [e.personLastName, e.personFirstName, e.personOtherNames].filter(Boolean).join(', ')

/** A police medical form (PF3) or a post-mortem, as the page the doctor's findings are written on. */
export function MedicalPaper({ exam }: { exam: MedicalExam }) {
  const who = medicalPersonName(exam)
  return (
    <RecordPaper
      entityType="medical_exam"
      entityId={exam.id}
      reference={exam.caseReference}
      title={medicalKindLabel(exam.kind)}
      details={[
        { label: m["medical.person"](), value: who },
        ...(exam.caseReference ? [{ label: m["paper.police.case"](), value: exam.caseReference, copy: exam.caseReference }] : []),
        ...(exam.facility ? [{ label: m["medical.facility"](), value: exam.facility }] : []),
        { label: m["medical.requested_at"](), value: format(exam.requestedAt, 'PPp') },
        ...(exam.examinedAt ? [{ label: m["medical.examined_at"](), value: format(exam.examinedAt, 'PPp') }] : []),
        { label: m["col.status"](), value: medicalStatusLabel(exam.status) },
      ]}
      events={[
        { at: exam.requestedAt, label: m["medical.requested_at"](), by: null },
        ...(exam.examinedAt ? [{ at: exam.examinedAt, label: m["medical.examined_at"](), by: exam.examinerName }] : []),
      ]}
      edit={(done) => <MedicalForm key={exam.id} exam={exam} onSuccess={done} />}
    >
      <section className="mb-5 flex flex-col gap-0.5">
        <PaperField label={m["medical.person"]()}>{who}</PaperField>
        {exam.caseReference && <PaperField label={m["paper.police.case"]()}>{exam.caseReference}</PaperField>}
        {exam.facility && <PaperField label={m["medical.facility"]()}>{exam.facility}</PaperField>}
        <PaperField label={m["medical.requested_at"]()}>{format(exam.requestedAt, 'PPPP')}</PaperField>
        {exam.examinedAt && <PaperField label={m["medical.examined_at"]()}>{format(exam.examinedAt, 'PPPP')}</PaperField>}
        <PaperField label={m["col.status"]()}>{medicalStatusLabel(exam.status)}</PaperField>
      </section>
      {exam.findings ? (
        <section className="mb-4">
          <h2 className="mb-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground">{m["medical.findings"]()}</h2>
          <p className="whitespace-pre-wrap">{exam.findings}</p>
        </section>
      ) : (
        <p className="text-muted-foreground">{m["medical.no_findings_yet"]()}</p>
      )}
      {exam.notes && <p className="whitespace-pre-wrap">{exam.notes}</p>}
      <section className="mt-12 flex justify-end">
        <SignatureLine name={exam.examinerName ?? ''} caption={m["medical.examiner"]()} />
      </section>
    </RecordPaper>
  )
}
