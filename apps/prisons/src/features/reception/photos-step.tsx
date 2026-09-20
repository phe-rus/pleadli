import { PhotoCapture } from '@/components/photo-capture'
import { PhoneLink, photoViewLabel, photoViews, type PhotoView } from '@/features/prisoner-photos'
import { useCallback, useRef } from 'react'
import { StepHeading, type StepProps } from './reception-steps'
import type { PhotoDrafts } from './schema'
import { m } from '@/paraglide/messages'

const hints: Record<PhotoView, string> = {
  get front() { return m.reception_head_and_shoulders_facing_the_camera() },
  get left() { return m.reception_turn_to_show_the_left_side() },
  get right() { return m.reception_turn_to_show_the_right_side() },
}

/** Front, left and right photographs. Optional at reception; a photo can be
 * taken later from the prisoner's profile. Each slot takes a camera shot or
 * an upload, and the phone link fills the slots from another device. */
export function PhotosStep({ draft, set }: StepProps) {
  const photos = useRef(draft.photos)
  photos.current = draft.photos
  const taken = photoViews.filter((view) => draft.photos[view]).length

  const merge = useCallback((batch: Partial<PhotoDrafts>) => set('photos', { ...photos.current, ...batch }), [set])

  return (
    <>
      <StepHeading title={m.reception_photos()} description={m.reception_a_front_photo_and_both_sides()} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{m.reception_of_3_taken({ taken })}</span>
        <PhoneLink taken={draft.photos} onPhotos={merge} />
      </div>
      <div className="flex flex-wrap gap-4">
        {photoViews.map((view) => (
          <PhotoCapture
            key={view}
            className="min-w-40 flex-1 basis-44"
            label={photoViewLabel[view]}
            hint={hints[view]}
            value={draft.photos[view]}
            onChange={(dataUrl) => merge({ [view]: dataUrl })}
          />
        ))}
      </div>
    </>
  )
}
