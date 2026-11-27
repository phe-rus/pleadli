import * as m from '@/paraglide/messages'
import { useEnclosures } from '@/features/paper/use-enclosures'
import { RecordPaper } from '@/features/paper/record-paper'
import { format } from '@/lib/date'
import { PaperField, SignatureLine } from '@pleadli/paper'
import { ReferralForm } from './referral-form'
import { referralDestinationTypeLabel, referralStatusLabel, type Referral } from './schema'

export const destination = (r: Referral) => r.destinationName || referralDestinationTypeLabel(r.destinationType)

/** The office named, then what kind of office it is, after a dot and not in brackets (the kind's own label can carry brackets). With no name the kind is the name, so it is not said twice. */
const destinationWithKind = (r: Referral) => (r.destinationName ? `${r.destinationName} · ${referralDestinationTypeLabel(r.destinationType)}` : referralDestinationTypeLabel(r.destinationType))

/** The covering letter a case file leaves the station with. */
export function ReferralPaper({ referral }: { referral: Referral }) {
  const { lines: enclosed } = useEnclosures(referral.caseId, { withCharges: true })
  return (
    <RecordPaper
      entityType="referral"
      entityId={referral.id}
      reference={referral.caseReference}
      title={m["referrals_page.paper_title"]()}
      details={[
        { label: m["paper.police.case"](), value: referral.caseReference, copy: referral.caseReference },
        { label: m["referrals_page.to"](), value: destination(referral) },
        { label: m["referrals.referred_at"](), value: format(referral.referredAt, 'PPp') },
        { label: m["col.status"](), value: referralStatusLabel(referral.status) },
      ]}
      events={[{ at: referral.referredAt, label: m["referrals_page.sent"](), by: referral.officerName }]}
      edit={(done) => <ReferralForm key={referral.id} referral={referral} onSuccess={done} />}
    >
      <section className="mb-5 flex flex-col gap-0.5">
        <PaperField label={m["referrals_page.to"]()}>{destinationWithKind(referral)}</PaperField>
        <PaperField label={m["paper.police.case"]()}>{referral.caseReference}</PaperField>
        <PaperField label={m["referrals.referred_at"]()}>{format(referral.referredAt, 'PPPP')}</PaperField>
        <PaperField label={m["col.status"]()}>{referralStatusLabel(referral.status)}</PaperField>
      </section>
      <p>{(referral.destinationType === 'dpp' ? m["referrals_page.covering"] : m["referrals_page.covering_plain"])({ reference: referral.caseReference, destination: destination(referral) })}</p>
      {referral.notes && <p className="whitespace-pre-wrap">{referral.notes}</p>}
      {enclosed.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground">{m['referrals.enclosed_heading']()}</h2>
          <ul className="list-disc pl-5">
            {enclosed.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="mt-12 flex justify-end">
        <SignatureLine name={referral.officerName} caption={m["referrals.referring_officer"]()} />
      </section>
    </RecordPaper>
  )
}

