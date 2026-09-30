import * as m from '@/paraglide/messages'
import { usePrintOnMount } from '@/hooks/use-print-on-mount'
import { ChargeSheetPrintable, chargeSheetsOptions, useChargeSheets } from '@/features/legal-forms'
import { createFileRoute, notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/print/legal-forms/$chargeSheetId')({
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
  const { data: chargeSheets } = useChargeSheets('')
  const cs = chargeSheets.find((c) => c.id === chargeSheetId)
  usePrintOnMount()

  if (!cs) return null

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <button type="button" onClick={() => window.history.back()} className="w-fit text-xs text-muted-foreground print:hidden">
        {m["print.back"]()}
      </button>
      <ChargeSheetPrintable chargeSheet={cs} />
    </article>
  )
}
