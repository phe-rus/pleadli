import type { LawyerDocument } from '@/features/documents'
import { buildDocumentPdf } from '@/features/filings/pack'
import { installationOptions } from '@/features/installation'
import * as m from '@/paraglide/messages'
import { Download04Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { buildDocumentDocx } from './docx'
import { saveFile } from './save'

/** A document out of the app: PDF to send or print, Word to keep working on
 * it elsewhere. A draft goes out as it stands now, marked DRAFT in the PDF. */
export function DocumentExport({ get, beforeExport }: { get: () => LawyerDocument; beforeExport?: () => Promise<unknown> }) {
  const { data: installation } = useQuery(installationOptions())
  const [busy, setBusy] = useState<'pdf' | 'docx' | null>(null)
  const run = async (kind: 'pdf' | 'docx') => {
    setBusy(kind)
    try {
      await beforeExport?.()
      const document = get()
      const base = [document.reference, document.title].filter(Boolean).join(' ')
      const firm = { name: installation?.officeName ?? null, address: installation?.address ?? null, phone: installation?.phone ?? null, email: installation?.email ?? null }
      const bytes = kind === 'pdf' ? await buildDocumentPdf(document, firm, m["document.verify_code"]()) : await buildDocumentDocx(document, firm.name)
      if (await saveFile(bytes, `${base}.${kind}`, kind)) t.success(m["export.saved"]())
    } catch (error) {
      t.error(m["export.failed"](), { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run('pdf')}>
        <HugeiconsIcon icon={Download04Icon} />
        PDF
      </Button>
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run('docx')}>
        <HugeiconsIcon icon={Download04Icon} />
        Word
      </Button>
    </>
  )
}
