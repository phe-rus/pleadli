import { instrumentKinds, instrumentStatusLabels, prisonerFileOptions, stayEntryKinds } from '@/features/custody'
import { custodyStatusLabel, nationalities, prisonerFullName, prisonerSexes, prisonerStatusLabel } from '@/features/prisoners/schema'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns/format'
import { DocFacts, DocSection, PrintFrame } from './print-frame'
import type { IssuedDocument } from './schema'
import { useDocumentTab } from './use-document-tab'
import { m } from '@/paraglide/messages'

const label = (list: readonly { value: string; label: string }[], value: string | null) => (value ? (list.find((item) => item.value === value)?.label ?? value) : null)

/** The record of a person's reception: who they are, under what authority they
 * were admitted, and the instruments received. Printed at admission and kept
 * with the file. */
export function ReceptionRecord({ prisonerId, issued }: { prisonerId: string; issued: IssuedDocument | null | undefined }) {
  const { data: file, isPending } = useQuery(prisonerFileOptions(prisonerId))
  useDocumentTab('reception_record', prisonerId, file ? prisonerFullName(file.prisoner) : null)
  if (isPending || !file) return <p>{m.documents_loading_the_file()}</p>

  const { prisoner, stays, instruments } = file
  const first = [...stays].sort((a, b) => a.enteredAt - b.enteredAt)[0]

  return (
    <PrintFrame
      kind="reception_record"
      issued={issued}
      attestations={[{ label: m.documents_admitting_officer() }, { label: m.documents_person_admitted_acknowledges_the_details(), name: prisonerFullName(prisoner) }, { label: m.documents_officer_in_charge() }]}
    >
      <DocSection title={m.documents_the_person()}>
        <DocFacts
          rows={[
            [m.documents_name(), prisonerFullName(prisoner)],
            [m.documents_prisoner_number(), prisoner.prisonerNumber],
            [m.documents_category(), prisonerStatusLabel(prisoner.status)],
            [m.documents_national_id(), prisoner.nationalId],
            [m.documents_reference(), prisoner.reference],
            [m.documents_date_of_birth(), prisoner.dateOfBirth ? format(prisoner.dateOfBirth, 'd MMM yyyy') : null],
            [m.documents_sex(), label(prisonerSexes, prisoner.sex)],
            [m.documents_nationality(), label(nationalities, prisoner.nationality)],
            [m.documents_offence(), prisoner.offence],
          ]}
        />
      </DocSection>

      <DocSection title={m.documents_admission()}>
        <DocFacts
          rows={[
            [m.documents_admitted(), format(prisoner.admittedAt, 'd MMM yyyy, HH:mm')],
            [m.documents_entry(), first ? (stayEntryKinds[first.entryKind as keyof typeof stayEntryKinds] ?? first.entryKind) : null],
            [m.documents_authority(), prisoner.admissionAuthority],
            [m.documents_status_now(), custodyStatusLabel(prisoner.currentStatus)],
            [m.documents_documents_pending(), prisoner.documentsPending ? m.documents_yes_the_instruments_below_are_still() : null],
          ]}
        />
      </DocSection>

      <DocSection title={m.documents_instruments_received()}>
        {instruments.length === 0 ? (
          <p>{m.documents_none_recorded()}</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left">{m.documents_instrument()}</th>
                <th className="text-left">{m.documents_authority()}</th>
                <th className="text-left">{m.documents_reference()}</th>
                <th className="text-left">{m.documents_status()}</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((instrument) => (
                <tr key={instrument.id}>
                  <td className="align-top">{instrumentKinds.find((k) => k.value === instrument.kind)?.label ?? instrument.kind}</td>
                  <td className="align-top">{instrument.issuingAuthority ?? ''}</td>
                  <td className="align-top">{instrument.reference ?? ''}</td>
                  <td className="align-top">{instrumentStatusLabels[instrument.status] ?? instrument.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DocSection>
    </PrintFrame>
  )
}
