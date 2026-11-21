import { RecordPaper } from '@/features/paper/record-paper'
import { instrumentKindLabel, instrumentStatusLabels, sentenceTermText, usePrisonerFile } from '@/features/custody'
import { PrisonerAvatar } from '@/features/prisoners/prisoner-avatar'
import { custodyStatusLabel, nationalities, prisonerFullName, prisonerSexes, prisonerStatusLabel } from '@/features/prisoners/schema'
import { PaperField, SignatureLine } from '@pleadli/paper'
import { format } from '@/lib/date'
import { m } from '@/paraglide/messages'

const day = (ms: number | null | undefined) => (ms == null ? '' : format(ms, 'd MMMM yyyy'))
const pick = (list: readonly { value: string; label: string }[], value: string | null) => (value ? (list.find((i) => i.value === value)?.label ?? value) : '')

/**
 * The prisoner's record as the prison keeps it on paper: who the person is,
 * why and since when they are held, under which warrants, and the dates the
 * law sets, signed by the Officer in Charge. It carries a code that
 * pleadli.com/verify checks, like every Pleadli paper.
 */
export function PrisonerRecordPaper({ prisonerId }: { prisonerId: string }) {
  const { data: file } = usePrisonerFile(prisonerId)
  const { prisoner, clocks, sentence, instruments } = file
  const name = prisonerFullName(prisoner)
  const remand = prisoner.status === 'unconvicted'

  return (
    <RecordPaper
      entityType="prisoner_record"
      entityId={prisoner.id}
      reference={prisoner.prisonerNumber}
      title={`${m.paper_prisoner_record()}: ${name}`}
      details={[
        { label: m.route_prisoners_prisoner_number(), value: prisoner.prisonerNumber ?? m.file_no_number() },
        { label: m.paper_category(), value: prisonerStatusLabel(prisoner.status) },
        { label: m.paper_admitted(), value: day(prisoner.admittedAt) },
      ]}
      events={[{ at: prisoner.admittedAt, label: m.paper_admitted() }]}
    >
      <h2>{m.paper_prisoner_record()}</h2>

      <section className="mb-5 flex items-start gap-5">
        <PrisonerAvatar prisonerId={prisoner.id} name={name} size={112} className="shrink-0 rounded-sm" />
        <div className="flex flex-col gap-0.5">
          <PaperField label={m.route_prisoners_name()}>{name}</PaperField>
          <PaperField label={m.route_prisoners_prisoner_number()}>{prisoner.prisonerNumber ?? ''}</PaperField>
          <PaperField label={m.prisoners_sex()}>{pick(prisonerSexes, prisoner.sex)}</PaperField>
          <PaperField label={m.prisoners_date_of_birth()}>{day(prisoner.dateOfBirth)}</PaperField>
          <PaperField label={m.prisoners_nationality()}>{pick(nationalities, prisoner.nationality)}</PaperField>
          <PaperField label={m.prisoners_national_id()}>{prisoner.nationalId ?? ''}</PaperField>
        </div>
      </section>

      <h3>{m.paper_section_custody()}</h3>
      <section className="mb-5 flex flex-col gap-0.5">
        <PaperField label={m.paper_category()}>{prisonerStatusLabel(prisoner.status)}</PaperField>
        <PaperField label={m.paper_status()}>{custodyStatusLabel(prisoner.currentStatus)}</PaperField>
        <PaperField label={m.paper_admitted()}>{day(prisoner.admittedAt)}</PaperField>
        <PaperField label={m.prisoners_offence()}>{prisoner.offence ?? ''}</PaperField>
        <PaperField label={m.file_where()}>{prisoner.currentLocation ?? m.prisoners_not_placed()}</PaperField>
      </section>

      <h3>{m.paper_section_authority()}</h3>
      {instruments.length === 0 ? (
        <p className="mb-5">{m.paper_none()}</p>
      ) : (
        <table className="mb-5">
          <thead>
            <tr>
              <th>{m.prisoners_instruments()}</th>
              <th>{m.prisoners_reference()}</th>
              <th>{m.paper_issued_by()}</th>
              <th>{m.paper_status()}</th>
            </tr>
          </thead>
          <tbody>
            {instruments.map((i) => (
              <tr key={i.id}>
                <td>{instrumentKindLabel(i.kind)}</td>
                <td>{i.reference ?? ''}</td>
                <td>{i.issuingAuthority ?? ''}</td>
                <td>{instrumentStatusLabels[i.status] ?? i.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>{m.paper_section_dates()}</h3>
      <section className="mb-5 flex flex-col gap-0.5">
        {remand ? (
          <>
            <PaperField label={m.file_bail_limit()}>{`${day(clocks.mandatoryBailOn)} (${prisoner.highCourtOnlyOffence ? m.prisoners_180_days_high_court_offence_art() : m.prisoners_60_days_art_23_6()})`}</PaperField>
            <PaperField label={m.file_next_court()}>{file.nextCourtAt ? format(file.nextCourtAt, 'd MMMM yyyy, HH:mm') : m.prisoners_none_scheduled()}</PaperField>
          </>
        ) : (
          <>
            {sentence && <PaperField label={m.prisoners_sentence()}>{`${sentenceTermText(sentence)}, ${m.prisoners_runs_from()} ${day(sentence.startsOn)}`}</PaperField>}
            <PaperField label={m.file_release_due()}>{clocks.isLife ? m.file_status_serving_life() : day(clocks.releaseDueOn)}</PaperField>
          </>
        )}
      </section>

      <section className="mt-12 flex justify-between gap-8">
        <SignatureLine caption={m.paper_recording_officer()} />
        <SignatureLine caption={m.paper_officer_in_charge()} />
      </section>
    </RecordPaper>
  )
}
