import { addAttachmentFile, addAttachmentFromPath, entityTypes } from '@/features/attachments'
import { useArrangeScans, useAssistSettings } from '@/features/assist/queries'
import * as m from '@/paraglide/messages'
import { Delete02Icon, FileImportIcon, SparklesIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { cn } from '@pleadli/ui/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { isTauri } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useEffect, useRef, useState } from 'react'
import { useCreateFileItem } from './queries'
import { FillFromPapers } from './fill-from-papers'
import type { Arranged } from '@/features/assist/data'

type Picked = { name: string; file?: File; path?: string }
type Phase =
  | { step: 'choose' }
  | { step: 'uploading'; done: number }
  | { step: 'reading'; since: number }
  | { step: 'done'; placed: number; found?: Arranged }
  | { step: 'failed'; message: string }

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/heic'

function Elapsed({ since }: { since: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="tabular-nums">{Math.round((Date.now() - since) / 1000)}s</span>
}

/** Bring paper into the file: a scanned PDF, or photos of the pages. With
 * Assist on, it reads them, splits them into the documents they are, and puts
 * each in its place in the file for a person to check. Without Assist, each
 * scan goes in as one document to be sorted by hand. */
export function ImportPaper({ fileId, open: openProp, onOpenChange, trigger = true }: { fileId: string; open?: boolean; onOpenChange?: (open: boolean) => void; trigger?: boolean }) {
  const [ownOpen, setOwnOpen] = useState(false)
  const open = openProp ?? ownOpen
  const setOpen = (next: boolean) => (onOpenChange ? onOpenChange(next) : setOwnOpen(next))
  const [picked, setPicked] = useState<Picked[]>([])
  const [phase, setPhase] = useState<Phase>({ step: 'choose' })
  const [dragOver, setDragOver] = useState(false)
  // Scans already stored on the file by an attempt that then failed: a retry reads them again, it does not store them twice.
  const [stored, setStored] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const { data: assist } = useAssistSettings()
  const arrange = useArrangeScans(fileId)
  const createItem = useCreateFileItem(fileId)
  const queryClient = useQueryClient()
  const busy = phase.step === 'uploading' || phase.step === 'reading'

  const reset = () => {
    setPicked([])
    setStored([])
    setPhase({ step: 'choose' })
  }

  const choose = async () => {
    if (isTauri()) {
      const paths = await openDialog({ multiple: true, filters: [{ name: 'Scans', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic'] }] })
      const list = Array.isArray(paths) ? paths : paths ? [paths] : []
      setPicked((p) => [...p, ...list.map((path) => ({ path, name: path.split(/[\\/]/).pop() ?? path }))])
    } else {
      input.current?.click()
    }
  }

  const run = async (useAssist: boolean) => {
    setPhase({ step: 'uploading', done: stored.length })
    const ids: string[] = [...stored]
    try {
      for (const [i, p] of picked.entries()) {
        if (i < stored.length) continue
        const att = p.file ? await addAttachmentFile(entityTypes.prosecutionFile, fileId, p.file) : await addAttachmentFromPath(entityTypes.prosecutionFile, fileId, p.path!)
        ids.push(att.id)
        setStored([...ids])
        setPhase({ step: 'uploading', done: i + 1 })
      }
      await queryClient.invalidateQueries({ queryKey: ['attachments'] })
      if (useAssist) {
        setPhase({ step: 'reading', since: Date.now() })
        const result = await arrange.mutateAsync(ids)
        setPhase({ step: 'done', placed: result.items.length, found: result })
      } else {
        for (const [i, id] of ids.entries()) {
          await createItem.mutateAsync({ prosecutionFileId: fileId, kind: 'other', title: picked[i].name.replace(/\.[^.]+$/, ''), attachmentId: id, pageFrom: 1 })
        }
        setPhase({ step: 'done', placed: ids.length })
      }
    } catch (e) {
      setPhase({ step: 'failed', message: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <>
      {trigger && (
        <Button size="sm" onClick={() => setOpen(true)}>
          <HugeiconsIcon icon={FileImportIcon} />
          {m["import.button"]()}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{m["import.title"]()}</DialogTitle>
            <DialogDescription>{assist?.ready ? m["import.lead_assist"]() : m["import.lead_plain"]()}</DialogDescription>
          </DialogHeader>

          {phase.step === 'choose' && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={choose}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const files = [...e.dataTransfer.files].filter((f) => ACCEPT.includes(f.type) || /\.(pdf|png|jpe?g|webp|heic)$/i.test(f.name))
                  setPicked((p) => [...p, ...files.map((file) => ({ file, name: file.name }))])
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center transition-colors',
                  dragOver ? 'border-primary bg-primary/5' : 'hover:bg-secondary/40',
                )}
              >
                <HugeiconsIcon icon={FileImportIcon} className="size-7 text-muted-foreground" />
                <strong>{m["import.drop"]()}</strong>
                <span className="text-muted-foreground">{m["import.kinds"]()}</span>
              </button>
              <input
                ref={input}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])]
                  e.target.value = ''
                  setPicked((p) => [...p, ...files.map((file) => ({ file, name: file.name }))])
                }}
              />
              {picked.length > 0 && (
                <ul className="flex list-none flex-col gap-1 p-0">
                  {picked.map((p, i) => (
                    <li key={`${p.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-1.5">
                      <span className="truncate">
                        {i + 1}. {p.name}
                      </span>
                      <Button size="icon-xs" variant="ghost" onClick={() => setPicked((all) => all.filter((_, j) => j !== i))} aria-label={m["import.remove"]()}>
                        <HugeiconsIcon icon={Delete02Icon} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {assist?.ready ? (
                  <>
                    <Button variant="ghost" disabled={picked.length === 0} onClick={() => run(false)}>
                      {m["import.without_assist"]()}
                    </Button>
                    <Button disabled={picked.length === 0} onClick={() => run(true)}>
                      <HugeiconsIcon icon={SparklesIcon} />
                      {m["import.read_and_arrange"]()}
                    </Button>
                  </>
                ) : (
                  <Button disabled={picked.length === 0} onClick={() => run(false)}>
                    {m["import.add"]()}
                  </Button>
                )}
              </div>
            </div>
          )}

          {phase.step === 'uploading' && (
            <div className="flex flex-col gap-2 py-6 text-center">
              <strong>{m["import.storing"]({ done: phase.done, total: picked.length })}</strong>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(phase.done / Math.max(1, picked.length)) * 100}%` }} />
              </div>
            </div>
          )}

          {phase.step === 'reading' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <HugeiconsIcon icon={SparklesIcon} className="size-7 animate-pulse text-primary" />
              <strong>{m["import.reading"]()}</strong>
              <p className="max-w-sm text-muted-foreground">
                {m["import.reading_body"]()} <Elapsed since={phase.since} />
              </p>
            </div>
          )}

          {phase.step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <strong>{m["import.done"]({ count: phase.placed })}</strong>
              <p className="text-muted-foreground">{m["import.done_body"]()}</p>
              {phase.found && (phase.found.people.length > 0 || phase.found.charges.length > 0 || phase.found.custody.length > 0) ? (
                <div className="w-full rounded-2xl bg-secondary/40 p-4">
                  <FillFromPapers
                    fileId={fileId}
                    people={phase.found.people}
                    charges={phase.found.charges}
                    custody={phase.found.custody}
                    onDone={() => {
                      setOpen(false)
                      reset()
                    }}
                  />
                </div>
              ) : (
                <Button
                  onClick={() => {
                    setOpen(false)
                    reset()
                  }}
                >
                  {m["import.see_file"]()}
                </Button>
              )}
            </div>
          )}

          {phase.step === 'failed' && (
            <div className="flex flex-col gap-3 py-4">
              <strong>{m["import.failed"]()}</strong>
              <p className="not-typeset text-destructive">{phase.message}</p>
              <p className="text-muted-foreground">{m["import.failed_body"]()}</p>
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => setPhase({ step: 'choose' })}>
                  {m["import.try_again"]()}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
