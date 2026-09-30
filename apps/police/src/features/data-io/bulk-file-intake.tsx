import * as m from '@/paraglide/messages'
import { CasePicker } from '@/components/case-picker'
import { PersonPicker } from '@/components/person-picker'
import { entityTypes, formatFileSize, useBulkAttachFiles, type BulkAttachResult } from '@/features/attachments'
import { Delete02Icon, FolderAddIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { isTauri } from '@tauri-apps/api/core'
import { useRef, useState } from 'react'

type TargetType = 'person' | 'case'

/** Either real filesystem paths (Tauri's native multi-file picker) or
 * `File` objects (the browser-dev `<input type="file" multiple>`
 * fallback), whichever the platform actually gave us, kept as picked
 * until the officer attaches or clears them. */
type SelectedFiles = { kind: 'paths'; items: string[] } | { kind: 'files'; items: File[] }

function fileLabel(item: string | File) {
  return typeof item === 'string' ? (item.split(/[/\\]/).pop() ?? item) : item.name
}

/** Bulk paperwork intake, lives in Settings → Data. For officers bringing
 * an existing stack of files (a person's old file, a case's supporting
 * documents) into the app at once: pick the one record everything belongs
 * to, pick every file, attach them all in one go. Each file lands wherever
 * a single attachment for that record already would; this doesn't
 * change where files go, only how many can go there at once. */
export function BulkFileIntake() {
  const [targetType, setTargetType] = useState<TargetType>('person')
  const [targetId, setTargetId] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedFiles | null>(null)
  const [result, setResult] = useState<BulkAttachResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bulkAttach = useBulkAttachFiles()

  const handleTargetTypeChange = (next: TargetType) => {
    setTargetType(next)
    setTargetId(null)
    setSelected(null)
    setResult(null)
  }

  const handlePickFiles = async () => {
    setResult(null)
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const paths = await open({ multiple: true })
      if (!paths) return
      setSelected({ kind: 'paths', items: Array.isArray(paths) ? paths : [paths] })
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setResult(null)
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    setSelected({ kind: 'files', items: files })
  }

  const handleAttach = async () => {
    if (!targetId || !selected) return
    const entityType = targetType === 'person' ? entityTypes.person : entityTypes.case
    try {
      const outcome = await bulkAttach.mutateAsync({
        entityType,
        entityId: targetId,
        input: selected.kind === 'paths' ? { paths: selected.items } : { files: selected.items },
      })
      setResult(outcome)
      setSelected(null)
      if (outcome.failed.length === 0) {
        t.success(outcome.attached.length === 1 ? m["data_io.files_attached_one"]() : m["data_io.files_attached"]({ count: outcome.attached.length }))
      } else {
        t.error(m["data_io.attached_failed"]({ attached: outcome.attached.length, failed: outcome.failed.length }), {
          description: m["data_io.see_details"](),
        })
      }
    } catch {
      t.error(m["data_io.attach_failed"](), { description: m["common.try_again"]() })
    }
  }

  return (
    <Field>
      <FieldLabel>{m["data_io.bulk_title"]()}</FieldLabel>
      <FieldDescription>
        {m["data_io.bulk_desc"]()}
      </FieldDescription>

      <div className="flex flex-col gap-3 pt-1 md:max-w-lg">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={targetType === 'person' ? 'default' : 'secondary'}
            onClick={() => handleTargetTypeChange('person')}
          >
            {m["common.person"]()}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={targetType === 'case' ? 'default' : 'secondary'}
            onClick={() => handleTargetTypeChange('case')}
          >
            {m["common.case"]()}
          </Button>
        </div>

        {targetType === 'person' ? (
          <PersonPicker value={targetId} onValueChange={setTargetId} placeholder={m["data_io.search_person"]()} />
        ) : (
          <CasePicker value={targetId} onValueChange={setTargetId} placeholder={m["data_io.search_case"]()} />
        )}

        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={handlePickFiles} disabled={!targetId}>
            <HugeiconsIcon icon={FolderAddIcon} />
            {m["data_io.choose_files"]()}
          </Button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInputChange} />
          {selected && (
            <span className="text-xs text-muted-foreground">
              {selected.items.length === 1 ? m["data_io.selected_one"]() : m["data_io.selected"]({ count: selected.items.length })}
            </span>
          )}
        </div>

        {selected && selected.items.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-md border border-input/40 p-2">
            {selected.kind === 'files'
              ? selected.items.map((file, index) => (
                  <li key={index} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">{file.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
                  </li>
                ))
              : selected.items.map((path, index) => (
                  <li key={index} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">{fileLabel(path)}</span>
                  </li>
                ))}
          </ul>
        )}

        <Button
          type="button"
          size="sm"
          onClick={handleAttach}
          disabled={!targetId || !selected || selected.items.length === 0 || bulkAttach.isPending}
        >
          {!selected ? m["data_io.attach_files"]() : selected.items.length === 1 ? m["data_io.attach_one"]() : m["data_io.attach_n"]({ count: selected.items.length })}
        </Button>

        {result && result.failed.length > 0 && (
          <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-2">
            {result.failed.map((failure, index) => (
              <div key={index} className="flex items-center gap-2 text-xs">
                <Badge variant="destructive" className="shrink-0">
                  <HugeiconsIcon icon={Delete02Icon} className="size-3" />
                </Badge>
                <span className="min-w-0 truncate">{fileLabel(failure.source)}</span>
                <span className="shrink-0 text-muted-foreground">{failure.error}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Field>
  )
}
