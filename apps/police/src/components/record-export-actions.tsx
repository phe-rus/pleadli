import * as m from '@/paraglide/messages'
import { Download01Icon, PrinterIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'

export type RecordExportActionsProps = {
  onPrint: () => void
  onExport: (format: 'pdf' | 'docx') => void
  exportPending?: boolean
}

/** Print / Export PDF / Export Word: the three actions a record needs
 * to leave the app: printed on paper, saved as a file to send on (DPP,
 * email), or saved as a file to edit. Used on the person, case, and
 * charge sheet detail pages; each supplies its own print/export
 * handlers, this just renders the buttons consistently. */
export function RecordExportActions({ onPrint, onExport, exportPending }: RecordExportActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={onPrint}>
        <HugeiconsIcon icon={PrinterIcon} />
        {m["common.print"]()}
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => onExport('pdf')} disabled={exportPending}>
        <HugeiconsIcon icon={Download01Icon} />
        {m["common.pdf"]()}
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => onExport('docx')} disabled={exportPending}>
        <HugeiconsIcon icon={Download01Icon} />
        {m["common.word"]()}
      </Button>
    </div>
  )
}
