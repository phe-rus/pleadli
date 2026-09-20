import { Attachment01Icon, Delete02Icon, Upload01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { isTauri } from '@tauri-apps/api/core'
import { useRef, useState } from 'react'
import { ApiError } from '@/lib/api'
import { openAttachment, pickFileNative, readBrowserFile } from './data'
import { useAddAttachment, useAttachments, useVoidAttachment } from './queries'
import { formatFileSize, type Attachment, type EntityType } from './schema'
import { m } from '@/paraglide/messages'

export type AttachmentsFieldProps = {
  entityType: EntityType
  entityId: string | null | undefined
  label?: string
}

export function AttachmentsField({ entityType, entityId, label = m.attachments_documents() }: AttachmentsFieldProps) {
  const id = entityId ?? ''
  const { data: attachments } = useAttachments(entityType, id)
  const addAttachment = useAddAttachment(entityType, id)
  const voidAttachment = useVoidAttachment(entityType, id)
  const [voiding, setVoiding] = useState<Attachment | null>(null)
  const [reason, setReason] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!entityId) {
    return (
      <Field>
        <FieldLabel>{label}</FieldLabel>
        <p className="text-xs text-muted-foreground">{m.attachments_save_this_record_first_then_you()}</p>
      </Field>
    )
  }

  const handlePick = async () => {
    if (isTauri()) {
      try {
        const picked = await pickFileNative()
        if (picked) await addAttachment.mutateAsync(picked)
      } catch (error) {
        t.error(m.attachments_could_not_add_document(), { description: error instanceof ApiError ? error.message : m.attachments_please_try_again() })
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
      await addAttachment.mutateAsync(await readBrowserFile(file))
    } catch (error) {
      t.error(m.attachments_could_not_add_document(), { description: error instanceof ApiError ? error.message : m.attachments_please_try_again() })
    }
  }

  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <Button type="button" size="sm" variant="secondary" onClick={handlePick} disabled={addAttachment.isPending}>
          <HugeiconsIcon icon={Upload01Icon} />
          {m.attachments_add_document()}
        </Button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInputChange} />
      </div>

      {(attachments ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">{m.attachments_no_documents_attached()}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {attachments?.map((attachment) => (
            <div key={attachment.id} className={cn('flex items-center justify-between gap-2 rounded-sm border border-input/40 px-2 py-1.5')}>
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => openAttachment(attachment)}>
                <HugeiconsIcon icon={Attachment01Icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate text-xs">{attachment.fileName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</span>
              </button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={m.attachments_void_document()}
                title={m.attachments_void_this_document_kept_on_record()}
                onClick={() => {
                  setReason('')
                  setVoiding(attachment)
                }}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={voiding !== null} onOpenChange={(open) => !open && setVoiding(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{m.attachments_void_this_document()}</DialogTitle>
            <DialogDescription>
              {m.attachments_documents_are_never_deleted_this_one()}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!voiding || !reason.trim()) return
              try {
                await voidAttachment.mutateAsync({ id: voiding.id, reason: reason.trim() })
                setVoiding(null)
              } catch (error) {
                t.error(m.attachments_could_not_void_document(), { description: error instanceof ApiError ? error.message : m.attachments_please_try_again() })
              }
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">{m.attachments_reason()}</span>
              <input
                autoFocus
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <Button type="submit" disabled={!reason.trim() || voidAttachment.isPending}>
              {m.attachments_void_document()}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Field>
  )
}
