import { RecordExportActions } from '@/components/record-export-actions'
import { ChargeSheetPrintable, chargeSheetsOptions, useChargeSheets, useExportChargeSheetDocument } from '@/features/legal-forms'
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { t } from '@pleadli/ui/goey-toaster'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/legal-forms/$chargeSheetId')({
  loader: async ({ context, params }) => {
    const chargeSheets = await context.queryClient.query({
      ...chargeSheetsOptions(''),
      staleTime: 'static',
    })
    if (!chargeSheets.some((cs) => cs.id === params.chargeSheetId)) throw notFound()
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { chargeSheetId } = Route.useParams()
  const navigate = useNavigate()
  const { data: chargeSheets } = useChargeSheets('')
  const exportDocument = useExportChargeSheetDocument(chargeSheetId)
  const cs = chargeSheets.find((c) => c.id === chargeSheetId)
  if (!cs) return null

  const handleExport = async (format: 'pdf' | 'docx') => {
    try {
      const found = await exportDocument.mutateAsync(format)
      if (found) t.success(`${format === 'pdf' ? 'PDF' : 'Word'} document exported`)
    } catch {
      t.error(`Could not export to ${format === 'pdf' ? 'PDF' : 'Word'}`, { description: 'Please try again.' })
    }
  }

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/legal-forms"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
          Back to Charge Sheets &amp; Forms
        </Link>
        <RecordExportActions
          onPrint={() => navigate({ to: '/print/legal-forms/$chargeSheetId', params: { chargeSheetId } })}
          onExport={handleExport}
          exportPending={exportDocument.isPending}
        />
      </div>

      <ChargeSheetPrintable chargeSheet={cs} />
    </article>
  )
}
