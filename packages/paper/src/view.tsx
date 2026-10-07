import { File01Icon, PrinterIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { usePaperApp, type OfficeApps, type PaperStamp } from './context'
import { nextPaint, printSheet, safeFileName, sheetWording, wordFile } from './output'
import { PaperSheet } from './sheet'
import { InkLayer } from './ink'
import { Segmented } from '@pleadli/ui/segmented'

export type PaperMode = 'preview' | 'edit' | 'write'

/**
 * A piece of paperwork shown as its paper. Preview is the page as it prints;
 * Edit is where it is changed (a form beside the page, or typing on the page
 * itself). Print and Save as Word first record the wording, so the paper that
 * leaves carries a code anyone can check it against.
 */
export function PaperView({
  entityType,
  entityId,
  reference,
  title,
  head,
  children,
  edit,
  defaultMode = 'preview',
  mode: controlledMode,
  onModeChange,
  onStamped,
  onWording,
  above,
  className,
}: {
  entityType: string
  entityId: string
  reference?: string | null
  title: string
  head?: ReactNode
  /** The wording, or a function of the mode for papers typed on directly. */
  children: ReactNode | ((mode: PaperMode) => ReactNode)
  /** Shown in Edit mode instead of the page. Leave out when the page is edited in place. */
  edit?: ReactNode
  defaultMode?: PaperMode
  mode?: PaperMode
  onModeChange?: (mode: PaperMode) => void
  /** Called with each version as it leaves, and with the wording on screen as it changes. */
  onStamped?: (stamp: PaperStamp) => void
  onWording?: (wording: string, changed: boolean) => void
  /** Shown between the tools and the page: ULII-style tabs, for instance. */
  above?: ReactNode
  className?: string
}) {
  const app = usePaperApp()
  const { labels } = app
  const [ownMode, setOwnMode] = useState<PaperMode>(defaultMode)
  const mode = controlledMode ?? ownMode
  const setMode = (m: PaperMode) => (onModeChange ? onModeChange(m) : setOwnMode(m))
  const sheet = useRef<HTMLDivElement>(null)
  const [stamp, setStamp] = useState<PaperStamp | null>(null)
  const [last, setLast] = useState<(PaperStamp & { body: string }) | null>(null)
  const [wording, setWording] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [office, setOffice] = useState<OfficeApps | null>(null)
  const editable = edit !== undefined || typeof children === 'function'
  const showPage = mode !== 'edit' || edit === undefined
  // Handwriting kept with this paper, where the app keeps it.
  const [ink, setInk] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    app.ink?.load(entityType, entityId).then((v) => alive && setInk(v)).catch(() => {})
    return () => {
      alive = false
    }
  }, [app, entityType, entityId])
  const writeInk = (next: string | null) => {
    setInk(next)
    void app.ink?.save(entityType, entityId, next)
  }
  const modes: PaperMode[] = [...(editable || app.ink ? (['preview'] as const) : []), ...(editable ? (['edit'] as const) : []), ...(app.ink ? (['write'] as const) : [])]

  useEffect(() => {
    app.office?.().then(setOffice).catch(() => {})
  }, [app])

  useEffect(() => {
    let alive = true
    app.lastPrint?.(entityType, entityId).then((p) => alive && setLast(p)).catch(() => {})
    return () => {
      alive = false
    }
  }, [app, entityType, entityId])

  // Keep the wording current, to tell whether it still matches the last printed paper.
  useLayoutEffect(() => {
    if (sheet.current && showPage) setWording(sheetWording(sheet.current))
  })

  const unchanged = !!last && last.body === wording
  useEffect(() => {
    if (wording) onWording?.(wording, !!last && !unchanged)
  }, [wording, unchanged, last, onWording])
  const shown = stamp ?? (unchanged ? last : null)

  async function prepare() {
    if (!sheet.current) return null
    setBusy(true)
    setError(null)
    try {
      const body = sheetWording(sheet.current)
      const s = await app.stamp({ entityType, entityId, reference: reference ?? null, title, body })
      setStamp(s)
      setLast({ ...s, body })
      onStamped?.(s)
      // Let the code and QR render before the page leaves.
      await nextPaint()
      return sheet.current
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.failed)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function print() {
    if (mode !== 'preview' && edit !== undefined) setMode('preview')
    const el = await prepare()
    if (el) await printSheet(el)
  }

  async function openInOffice() {
    const el = await prepare()
    if (el && app.openFile) await app.openFile(`${safeFileName(title)}.doc`, wordFile(el, title))
  }

  async function word() {
    const el = await prepare()
    if (el) await app.saveFile(`${safeFileName(title)}.doc`, wordFile(el, title), 'application/msword', 'doc')
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div data-paper-tools className="flex flex-wrap items-center justify-between gap-2">
        {modes.length > 1 ? (
          <Segmented
            label={labels.preview}
            value={mode}
            onChange={setMode}
            items={modes.map((m) => ({ value: m, label: m === 'preview' ? labels.preview : m === 'edit' ? labels.edit : labels.write }))}
          />
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {last && unchanged && app.formatDate && <span className="text-xs text-muted-foreground">{labels.lastPrinted(app.formatDate(last.printedAt))}</span>}
          {app.openFile && office && (
            // Always offered: Word where Office is installed, else LibreOffice,
            // else whatever program this computer opens Word files with.
            <Button size="sm" variant="ghost" disabled={busy} onClick={openInOffice}>
              <HugeiconsIcon icon={File01Icon} data-icon="inline-start" />
              {office.word ? labels.openInWord : office.libreOffice ? labels.openInLibreOffice : labels.openElsewhere}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={word}>
            <HugeiconsIcon icon={File01Icon} data-icon="inline-start" />
            {labels.word}
          </Button>
          <Button size="sm" disabled={busy} onClick={print} title={office?.os === 'windows' ? labels.printHintWindows : labels.printHint}>
            <HugeiconsIcon icon={PrinterIcon} data-icon="inline-start" />
            {busy ? labels.saving : labels.print}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {above}
      {mode === 'write' && (
        <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          {labels.writeHint}
          {ink && (
            <Button size="xs" variant="ghost" onClick={() => writeInk(null)}>
              {labels.clearWriting}
            </Button>
          )}
        </p>
      )}
      {showPage ? (
        <PaperSheet
          ref={sheet}
          head={head}
          title={title}
          stamp={shown}
          reference={reference}
          overlay={(ink || mode === 'write') && app.ink ? <InkLayer value={ink} active={mode === 'write'} onChange={writeInk} /> : undefined}
        >
          {typeof children === 'function' ? children(mode === 'write' ? 'preview' : mode) : children}
        </PaperSheet>
      ) : (
        edit
      )}
    </div>
  )
}
