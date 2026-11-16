import { useState } from 'react'
import { Button } from '@pleadli/ui/button'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@pleadli/ui/dropdown-menu'
import { t } from '@pleadli/ui/goey-toaster'
import { exportFormats, exportPaper, type ExportFormat } from './export'

/** These actions accompany the paper preview, never a data entry form. */
export function DocumentActions({ title }: { title: string }) {
  const [saving, setSaving] = useState(false)
  async function save(format: ExportFormat) {
    const paper = document.querySelector('[data-document-paper]')
    if (!paper || saving) return
    setSaving(true)
    try {
      if (await exportPaper(title, paper, format)) t.success('Document exported', { description: `${exportFormats[format].label} (.${format}).` })
    } catch (error) {
      t.error('Could not export the document', { description: error instanceof Error ? error.message : 'Your paper is still available here. Try another destination.' })
    } finally { setSaving(false) }
  }
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => window.print()}>Print</Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" variant="secondary" disabled={saving} />}>
          {saving ? 'Exporting…' : 'Export document'}<span aria-hidden="true">⌄</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56 rounded-xl p-1.5">
          {(Object.keys(exportFormats) as ExportFormat[]).map(format => (
            <DropdownMenuItem key={format} onClick={() => void save(format)} className="min-h-10 rounded-lg px-3">
              {exportFormats[format].label}<span className="ml-auto text-muted-foreground">.{format}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => window.print()} className="min-h-10 rounded-lg px-3">Print document</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
