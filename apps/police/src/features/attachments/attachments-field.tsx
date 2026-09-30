import * as m from '@/paraglide/messages'
import { Attachment01Icon, Delete02Icon, Upload01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { isTauri } from '@tauri-apps/api/core'
import { useRef } from 'react'
import { openAttachment } from './data'
import { useAddAttachment, useAttachments, useDeleteAttachment } from './queries'
import { formatFileSize, type EntityType } from './schema'

export type AttachmentsFieldProps = {
  entityType: EntityType
  entityId: string | null | undefined
  label?: string
}

export function AttachmentsField({ entityType, entityId, label = m["attachments.label"]() }: AttachmentsFieldProps) {
  const id = entityId ?? ''
  const { data: attachments } = useAttachments(entityType, id)
  const addAttachment = useAddAttachment(entityType, id)
  const deleteAttachment = useDeleteAttachment(entityType, id)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!entityId) {
    return (
      <Field>
        <FieldLabel>{label}</FieldLabel>
        <p className="text-xs text-muted-foreground">{m["attachments.save_first"]()}</p>
      </Field>
    )
  }

  const handlePick = async () => {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const path = await open({ multiple: false })
      if (typeof path !== 'string') return
      try {
        await addAttachment.mutateAsync({ path })
      } catch {
        t.error(m["attachments.add_failed"](), { description: m["common.try_again"]() })
      }
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      await addAttachment.mutateAsync({ file })
    } catch {
      t.error(m["attachments.add_failed"](), { description: m["common.try_again"]() })
    }
  }

  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <Button type="button" size="sm" variant="secondary" onClick={handlePick} disabled={addAttachment.isPending}>
          <HugeiconsIcon icon={Upload01Icon} />
          {m["attachments.add_file"]()}
        </Button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInputChange} />
      </div>

      {(attachments ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">{m["attachments.none"]()}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {attachments?.map((attachment) => (
            <div
              key={attachment.id}
              className={cn(
                'flex items-center justify-between gap-2 rounded-sm border border-input/40 px-2 py-1.5',
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => openAttachment(attachment)}
              >
                <HugeiconsIcon icon={Attachment01Icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate text-xs">{attachment.fileName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</span>
              </button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={m["attachments.remove"]()}
                onClick={() => deleteAttachment.mutate(attachment.id)}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Field>
  )
}
