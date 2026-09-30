import * as m from '@/paraglide/messages'
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
      if (started) t.success(m["data_io.vault_exported"](), { description: m["data_io.vault_exported_desc"]() })
    } catch {
      t.error(m["data_io.vault_failed"](), { description: m["common.try_again"]() })
    }
  }

  const handleXlsx = async () => {
    try {
      const started = await exportXlsx.mutateAsync()
      if (started) t.success(m["data_io.xlsx_exported"](), { description: m["data_io.xlsx_exported_desc"]() })
    } catch {
      t.error(m["data_io.xlsx_failed"](), { description: m["common.try_again"]() })
    }
  }

  const handleDocument = async (format: 'pdf' | 'docx') => {
    try {
      const started = await exportDocument.mutateAsync(format)
      if (started) t.success(format === 'pdf' ? m["data_io.pdf_exported"]() : m["data_io.word_exported"](), { description: m["data_io.doc_exported_desc"]() })
    } catch {
      t.error(format === 'pdf' ? m["data_io.pdf_failed"]() : m["data_io.word_failed"](), { description: m["common.try_again"]() })
    }
  }

  return (
    <Field>
      <FieldLabel>{m["data_io.export_all"]()}</FieldLabel>
      <FieldDescription>
        {m["data_io.export_all_desc"]()}
      </FieldDescription>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" size="sm" variant="secondary" onClick={handleMarkdown} disabled={exportMarkdown.isPending}>
          <HugeiconsIcon icon={Download01Icon} />
          {m["data_io.as_markdown"]()}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={handleXlsx} disabled={exportXlsx.isPending}>
          <HugeiconsIcon icon={Download01Icon} />
          {m["data_io.as_excel"]()}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => handleDocument('pdf')}
          disabled={exportDocument.isPending}
        >
          <HugeiconsIcon icon={Download01Icon} />
          {m["data_io.as_pdf"]()}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => handleDocument('docx')}
          disabled={exportDocument.isPending}
        >
          <HugeiconsIcon icon={Download01Icon} />
          {m["data_io.as_word"]()}
        </Button>
      </div>
    </Field>
  )
}
