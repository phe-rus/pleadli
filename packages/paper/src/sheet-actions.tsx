import { File01Icon, PrinterIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { useEffect, useState, type RefObject } from 'react'
import { usePaperApp, type OfficeApps } from './context'
import { printSheet, safeFileName, wordFile } from './output'

/**
 * Print, Save as Word and Open in Word for a sheet drawn elsewhere (a sealed
 * document that carries its own code). `target` holds the sheet; the first
 * `[data-document-sheet]` inside it is used when present.
 */
export function SheetActions({ target, title, extra }: { target: RefObject<HTMLElement | null>; title: string; extra?: React.ReactNode }) {
  const app = usePaperApp()
  const { labels } = app
  const [office, setOffice] = useState<OfficeApps | null>(null)
  useEffect(() => {
    app.office?.().then(setOffice).catch(() => {})
  }, [app])
  const sheet = () => target.current?.querySelector<HTMLElement>('[data-document-sheet]') ?? target.current
  return (
    <div data-paper-tools className="flex flex-wrap items-center justify-end gap-2">
      {extra}
      {app.openFile && office && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const el = sheet()
            if (el) void app.openFile!(`${safeFileName(title)}.doc`, wordFile(el, title))
          }}
        >
          <HugeiconsIcon icon={File01Icon} data-icon="inline-start" />
          {office.word ? labels.openInWord : office.libreOffice ? labels.openInLibreOffice : labels.openElsewhere}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          const el = sheet()
          if (el) void app.saveFile(`${safeFileName(title)}.doc`, wordFile(el, title), 'application/msword', 'doc')
        }}
      >
        <HugeiconsIcon icon={File01Icon} data-icon="inline-start" />
        {labels.word}
      </Button>
      <Button
        size="sm"
        title={office?.os === 'windows' ? labels.printHintWindows : labels.printHint}
        onClick={() => {
          const el = sheet()
          if (el) void printSheet(el)
        }}
      >
        <HugeiconsIcon icon={PrinterIcon} data-icon="inline-start" />
        {labels.print}
      </Button>
    </div>
  )
}
