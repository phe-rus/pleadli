import { prisonerFileOptions } from '@/features/custody'
import { prisonerFullName } from '@/features/prisoners/schema'
import { parseWaivedGates, releaseTypeLabel, releasesForPrisonerOptions } from '@/features/releases'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays'
import { format } from 'date-fns/format'
import { DocFacts, DocSection, PrintFrame } from './print-frame'
import type { IssuedDocument } from './schema'
import { useDocumentTab } from './use-document-tab'
import { m } from '@/paraglide/messages'

/** The certificate that a person has been discharged: when, on what basis, and
 * on whose order, including any gate that was waived by the Officer in
 * Charge. Only exists for someone who has been discharged. */
export function DischargeCertificate({ prisonerId, issued }: { prisonerId: string; issued: IssuedDocument | null | undefined }) {
  const { data: file, isPending } = useQuery(prisonerFileOptions(prisonerId))
  const { data: releases } = useQuery(releasesForPrisonerOptions(prisonerId))
  useDocumentTab('discharge_certificate', prisonerId, file ? prisonerFullName(file.prisoner) : null)
  if (isPending || !file || !releases) return <p>{m.documents_loading_the_file()}</p>

  const release = [...releases].sort((a, b) => b.releasedAt - a.releasedAt)[0]
  if (!release) return <p>{m.documents_this_person_has_not_been_discharged()}</p>
  const { prisoner } = file
  const waived = parseWaivedGates(release.exceptionGates)

  return (
    <PrintFrame
      kind="discharge_certificate"
      issued={issued}
      attestations={[{ label: m.documents_discharging_officer() }, { label: m.documents_person_discharged_acknowledges_release(), name: prisonerFullName(prisoner) }, { label: m.documents_officer_in_charge(), name: release.authorisedBy }]}
    >
      <DocSection title={m.documents_the_person()}>
        <DocFacts rows={[[m.documents_name(), prisonerFullName(prisoner)], [m.documents_prisoner_number(), prisoner.prisonerNumber], [m.documents_national_id(), prisoner.nationalId], [m.documents_offence(), prisoner.offence]]} />
      </DocSection>

      <DocSection title={m.documents_discharge()}>
        <DocFacts
          rows={[
            [m.documents_discharged(), format(release.releasedAt, 'd MMMM yyyy, HH:mm')],
            [m.documents_type(), releaseTypeLabel(release.releaseType)],
            [m.documents_ordered_by(), release.orderedBy],
            [m.documents_basis(), release.basis],
            [m.documents_held(), `${differenceInCalendarDays(release.releasedAt, prisoner.admittedAt)} days, from ${format(prisoner.admittedAt, 'd MMM yyyy')}`],
            [m.documents_notes(), release.notes],
          ]}
        />
      </DocSection>

      {release.authorisedBy && (
        <DocSection title={m.documents_authorised_exception()}>
          <p>
            {m.documents_exception_intro({ checks: waived.length > 0 ? m.documents_these_checks_waived() : m.documents_a_check_waived() })}
          </p>
          <DocFacts rows={[[m.documents_authorised_by(), release.authorisedBy], [m.documents_reason(), release.exceptionReason], [m.documents_waived(), waived.map((g) => g.replace(/_/g, ' ')).join(', ')]]} />
        </DocSection>
      )}
    </PrintFrame>
  )
}
