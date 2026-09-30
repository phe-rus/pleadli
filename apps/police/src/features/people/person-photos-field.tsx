import * as m from '@/paraglide/messages'
import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { isTauri } from '@tauri-apps/api/core'
import { useRef, useState } from 'react'
// Imported from the submodule directly, not the `@/features/attachments`
// barrel: that barrel re-exports `attachments-field.tsx`, and going
// through it here risks the same circular-import trap noted there.
import { useAttachmentDataUrl, useClearPersonPhoto, useSetPersonPhoto } from '@/features/attachments/queries'
import { personPhotoAngles, type Attachment, type PersonPhotoAngle } from '@/features/attachments/schema'

export type PersonPhotosFieldProps = {
  personId: string
  attachments: Attachment[]
}

function PhotoSlot({
  label,
  attachment,
  onPick,
  onClear,
  disabled,
}: {
  label: string
  attachment: Attachment | undefined
  onPick: () => void
  onClear: () => void
  disabled: boolean
}) {
  const { data: dataUrl } = useAttachmentDataUrl(attachment?.id)

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'group relative flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-muted/40',
          dataUrl ? 'border-input/40' : 'border-dashed border-input/60',
        )}
      >
        {dataUrl ? (
          <>
            <img src={dataUrl} alt={label} className="h-full w-full object-cover" />
            <div className="absolute inset-0 hidden items-center justify-center gap-1.5 bg-black/50 group-hover:flex">
              <Button type="button" size="sm" variant="secondary" onClick={onPick} disabled={disabled}>
                {m["common.replace"]()}
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                aria-label={m["people.remove_photo"]({ angle: label.toLowerCase() })}
                onClick={onClear}
                disabled={disabled}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="flex flex-col items-center gap-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            onClick={onPick}
            disabled={disabled}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-5" />
            <span className="text-[0.625rem]">{m["common.add"]()}</span>
          </button>
        )}
      </div>
      <span className="text-center text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

/** A person's mugshot set: four fixed slots (front, left profile, right
 * profile, back) an officer fills in directly, rather than uploading a
 * generic file and having to remember to star it as the headshot. The
 * front slot is what shows up as this person's avatar everywhere else in
 * the app. */
export function PersonPhotosField({ personId, attachments }: PersonPhotosFieldProps) {
  const setPhoto = useSetPersonPhoto(personId)
  const clearPhoto = useClearPersonPhoto(personId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingAngle, setPendingAngle] = useState<PersonPhotoAngle | null>(null)

  const byAngle = new Map(
    attachments.filter((a): a is Attachment & { photoAngle: string } => a.photoAngle != null).map((a) => [a.photoAngle, a]),
  )

  const handlePick = async (angle: PersonPhotoAngle) => {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const path = await open({
        multiple: false,
        filters: [{ name: m["common.image"](), extensions: ['png', 'jpg', 'jpeg', 'webp', 'heic'] }],
      })
      if (typeof path !== 'string') return
      try {
        await setPhoto.mutateAsync({ angle, path })
      } catch {
        t.error(m["people.photo_failed"](), { description: m["common.try_again"]() })
      }
      return
    }
    setPendingAngle(angle)
    fileInputRef.current?.click()
  }

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const angle = pendingAngle
    event.target.value = ''
    setPendingAngle(null)
    if (!file || !angle) return
    try {
      await setPhoto.mutateAsync({ angle, file })
    } catch {
      t.error(m["people.photo_failed"](), { description: m["common.try_again"]() })
    }
  }

  return (
    <Field>
      <FieldLabel>{m["people.photos"]()}</FieldLabel>
      <div className="grid grid-cols-4 gap-3 max-[420px]:grid-cols-2">
        {personPhotoAngles.map(({ value, label }) => (
          <PhotoSlot
            key={value}
            label={label}
            attachment={byAngle.get(value)}
            onPick={() => handlePick(value)}
            onClear={() => clearPhoto.mutate(value)}
            disabled={setPhoto.isPending || clearPhoto.isPending}
          />
        ))}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInputChange} />
    </Field>
  )
}
