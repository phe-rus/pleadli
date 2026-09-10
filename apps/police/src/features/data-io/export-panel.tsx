import { Download01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { useExportAllDocument, useExportAllMarkdown, useExportAllXlsx } from './queries'

/** Bulk "export everything", lives in Settings → Data. Markdown is the
 * default (a full, navigable copy of the Police Vault, zipped); Excel
 * gives the same data as one workbook, a sheet per record type. */
export function ExportPanel() {
  const exportMarkdown = useExportAllMarkdown()
  const exportXlsx = useExportAllXlsx()
  const exportDocument = useExportAllDocument()

  const handleMarkdown = async () => {
    try {
      const started = await exportMarkdown.mutateAsync()
      if (started) t.success('Vault exported', { description: 'Every record, regenerated fresh and zipped.' })
    } catch {
      t.error('Could not export the Vault', { description: 'Please try again.' })
    }
  }

  const handleXlsx = async () => {
    try {
      const started = await exportXlsx.mutateAsync()
      if (started) t.success('Excel workbook exported', { description: 'One sheet per record type.' })
    } catch {
      t.error('Could not export to Excel', { description: 'Please try again.' })
    }
  }

  const handleDocument = async (format: 'pdf' | 'docx') => {
    try {
      const started = await exportDocument.mutateAsync(format)
      if (started) t.success(`${format === 'pdf' ? 'PDF' : 'Word'} document exported`, { description: 'Every table, one flowing document.' })
    } catch {
      t.error(`Could not export to ${format === 'pdf' ? 'PDF' : 'Word'}`, { description: 'Please try again.' })
    }
  }

  return (
    <Field>
      <FieldLabel>Export all data</FieldLabel>
      <FieldDescription>
        Every record this station has entered, in one file, organized the same way the Police Vault already is on
        disk. Markdown is the default; Excel, PDF, and Word give the same data in those formats.
      </FieldDescription>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" size="sm" variant="secondary" onClick={handleMarkdown} disabled={exportMarkdown.isPending}>
          <HugeiconsIcon icon={Download01Icon} />
          Export as Markdown (.zip)
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={handleXlsx} disabled={exportXlsx.isPending}>
          <HugeiconsIcon icon={Download01Icon} />
          Export as Excel (.xlsx)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => handleDocument('pdf')}
          disabled={exportDocument.isPending}
        >
          <HugeiconsIcon icon={Download01Icon} />
          Export as PDF
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => handleDocument('docx')}
          disabled={exportDocument.isPending}
        >
          <HugeiconsIcon icon={Download01Icon} />
          Export as Word (.docx)
        </Button>
      </div>
    </Field>
  )
}
