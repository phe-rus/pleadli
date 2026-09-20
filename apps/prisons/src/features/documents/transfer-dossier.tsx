import { instrumentKinds, prisonerFileOptions, sentenceTermText } from '@/features/custody'
import { prisonerFullName, prisonerStatusLabel } from '@/features/prisoners/schema'
import { checklistItems, parseChecklist, transfersOptions } from '@/features/transfers'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns/format'
import { DocFacts, DocSection, PrintFrame } from './print-frame'
import type { IssuedDocument } from './schema'
import { useDocumentTab } from './use-document-tab'
import { m } from '@/paraglide/messages'

const when = (ms: number | null) => (ms ? format(ms, 'd MMM yyyy, HH:mm') : null)

/** The paper that goes with a person moving to another prison: who, on whose
 * order, the legal position, what has been prepared, and the digest of the
 * electronic dossier so the two can be matched. */
export function TransferDossier({ transferId, issued }: { transferId: string; issued: IssuedDocument | null | undefined }) {
  const { data: transfers, isPending } = useQuery(transfersOptions())
  const transfer = transfers?.find((t) => t.id === transferId)
  const prisonerId = transfer?.prisonerId ?? ''
  const { data: file } = useQuery({ ...prisonerFileOptions(prisonerId), enabled: prisonerId !== '' })
  useDocumentTab('transfer_dossier', transferId, transfer ? (transfer.personName ?? (file ? prisonerFullName(file.prisoner) : null)) : null)
  if (isPending) return <p>{m.documents_loading_the_transfer()}</p>
  if (!transfer) return <p>{m.documents_that_transfer_could_not_be_found()}</p>

  const checklist = parseChecklist(transfer.checklistJson)
  const name = file ? prisonerFullName(file.prisoner) : (transfer.personName ?? m.documents_unknown())
  const outgoing = transfer.direction !== 'in'

  return (
    <PrintFrame
      kind="transfer_dossier"
      issued={issued}
      attestations={[{ label: outgoing ? m.documents_officer_in_charge_sending() : m.documents_officer_in_charge_receiving() }, { label: m.documents_escort_officer(), name: transfer.escort }, { label: outgoing ? m.documents_receiving_officer() : m.documents_sending_officer() }]}
    >
      <DocSection title={m.documents_the_movement()}>
        <DocFacts
          rows={[
            [outgoing ? 'To' : m.documents_from(), transfer.otherPrisonName],
            [m.documents_ordered_by(), transfer.orderingAuthority],
            [m.documents_order_reference(), transfer.orderReference],
            [m.documents_reason(), transfer.reason],
            [m.documents_planned(), when(transfer.plannedAt)],
            [m.documents_dispatched(), when(transfer.dispatchedAt)],
            [m.documents_escort(), transfer.escort],
            [m.documents_transport(), transfer.transport],
            [m.documents_arrived(), when(transfer.arrivedAt)],
          ]}
        />
      </DocSection>

      <DocSection title={m.documents_the_person()}>
        <DocFacts
          rows={[
            [m.documents_name(), name],
            [m.documents_prisoner_number(), file?.prisoner.prisonerNumber],
            [m.documents_category(), file ? prisonerStatusLabel(file.prisoner.status) : null],
            [m.documents_national_id(), file?.prisoner.nationalId],
            [m.documents_offence(), file?.prisoner.offence],
          ]}
        />
      </DocSection>

      {file && (
        <DocSection title={m.documents_legal_position()}>
          <DocFacts
            rows={[
              [m.documents_sentence(), file.sentence ? sentenceTermText(file.sentence) : m.documents_none_not_convicted_or_no_sentence()],
              [m.documents_next_court(), file.nextCourtAt ? format(file.nextCourtAt, 'd MMM yyyy') : m.documents_none_scheduled()],
              [m.documents_instruments(), file.instruments.map((i) => `${instrumentKinds.find((k) => k.value === i.kind)?.label ?? i.kind}${i.reference ? ` (${i.reference})` : ''}`).join('; ') || m.documents_none_recorded_2()],
            ]}
          />
        </DocSection>
      )}

      <DocSection title={m.documents_prepared_for_the_move()}>
        <table className="w-full">
          <tbody>
            {checklistItems.map((item) => (
              <tr key={item.key}>
                <td className="w-24 align-top">{checklist[item.key] ? m.documents_done() : m.documents_not_done()}</td>
                <td className="align-top">{item.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {checklist.note && <p>{checklist.note}</p>}
      </DocSection>

      {transfer.dossierDigest && (
        <DocSection title={m.documents_electronic_dossier()}>
          <DocFacts rows={[[m.documents_digest(), <code key="d">{transfer.dossierDigest}</code>]]} />
          <p>{m.documents_the_receiving_prison_matches_this_digest()}</p>
        </DocSection>
      )}
    </PrintFrame>
  )
}
