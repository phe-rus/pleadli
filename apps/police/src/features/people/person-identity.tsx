import * as m from '@/paraglide/messages'
import { personPhotoAngles, useAttachmentDataUrl } from '@/features/attachments'
import { PaperField } from '@pleadli/paper'
import { useQuery } from '@tanstack/react-query'
import { personProfileOptions } from './queries'

const labelOf = (angle: string) => personPhotoAngles.find((a) => a.value === angle)?.label ?? angle

function Photo({ attachmentId, angle, className }: { attachmentId?: string; angle: string; className: string }) {
  const { data: src } = useAttachmentDataUrl(attachmentId)
  return (
    <figure className="m-0 flex flex-col items-center gap-1">
      <div className={`flex items-center justify-center overflow-hidden border border-black/50 bg-white ${className}`}>
        {src ? <img src={src} alt={labelOf(angle)} className="h-full w-full object-cover" /> : <span className="px-1 text-center text-[8pt] text-black/40">{m["identity.no_photo"]()}</span>}
      </div>
      <figcaption className="text-[8pt]">{labelOf(angle)}</figcaption>
    </figure>
  )
}

/**
 * Who the person is, laid out as a booking sheet lays it out: the front view
 * and the side profile side by side at the same height (the convention every
 * identification record follows), the particulars beside them, and the other
 * side and the back small underneath only when they were taken.
 */
export function PersonIdentity({ personId }: { personId: string }) {
  const { data: profile } = useQuery(personProfileOptions(personId))
  if (!profile) return null
  const { person, attachments } = profile
  const byAngle = new Map(attachments.filter((a) => a.photoAngle).map((a) => [a.photoAngle!, a.id]))
  const name = [person.firstName, person.otherNames, person.lastName].filter(Boolean).join(' ')
  const extra = (['left_profile', 'back'] as const).filter((a) => byAngle.has(a))
  return (
    <section className="mb-6 flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <Photo attachmentId={byAngle.get('front')} angle="front" className="h-[48mm] w-[36mm]" />
        <Photo attachmentId={byAngle.get('right_profile')} angle="right_profile" className="h-[48mm] w-[36mm]" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
          <PaperField label={m["identity.name"]()}>{name}</PaperField>
          {person.nationalId && <PaperField label={m["identity.national_id"]()}>{person.nationalId}</PaperField>}
          {person.phone && <PaperField label={m["identity.phone"]()}>{person.phone}</PaperField>}
          {person.address && <PaperField label={m["identity.address"]()}>{person.address}</PaperField>}
        </div>
      </div>
      {extra.length > 0 && (
        <div className="flex gap-3">
          {extra.map((angle) => (
            <Photo key={angle} attachmentId={byAngle.get(angle)} angle={angle} className="h-[30mm] w-[22.5mm]" />
          ))}
        </div>
      )}
    </section>
  )
}
