import { chargeSheetAccusedName, chargeSheetsOptions, useChargeSheets } from '@/features/legal-forms'
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { format } from 'date-fns/format'

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
  const { data: chargeSheets } = useChargeSheets('')
  const cs = chargeSheets.find((c) => c.id === chargeSheetId)
  if (!cs) return null

  const accusedName = chargeSheetAccusedName(cs)

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <Link
        to="/legal-forms"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
        Back to Charge Sheets &amp; Forms
      </Link>

      <div className="mx-auto w-full max-w-2xl rounded-md border border-border/60 bg-card p-8 text-sm leading-relaxed">
        <header className="mb-6 text-center">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Uganda Police Force</p>
          <h1 className="text-base font-semibold tracking-wide uppercase">Charge · PF 53</h1>
        </header>

        <section className="mb-5 grid grid-cols-2 gap-2 border-b border-border/60 pb-4 text-xs">
          <div>
            <span className="text-muted-foreground">Station: </span>
            {cs.stationName || '·'}
          </div>
          <div className="text-right">
            <span className="text-muted-foreground">Date: </span>
            {format(cs.chargedAt, 'PPP')}
          </div>
          <div>
            <span className="text-muted-foreground">CRB / Case reference: </span>
            {cs.caseReference}
          </div>
          <div className="text-right">
            <span className="text-muted-foreground">Accused: </span>
            {accusedName ?? '·'}
          </div>
        </section>

        <section className="mb-5">
          <h2 className="mb-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Statement of Offence
          </h2>
          <p>
            {cs.offence}, contrary to {cs.statutorySection}.
          </p>
        </section>

        <section className="mb-5">
          <h2 className="mb-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Particulars of Offence
          </h2>
          <p className="whitespace-pre-wrap">{cs.particulars}</p>
        </section>

        <section className="mt-8 flex items-end justify-between border-t border-border/60 pt-4 text-xs">
          <div>
            <p className="mb-6">Preferred by:</p>
            <p className="border-t border-foreground/40 pt-1">{cs.officerName || 'Signature of preferring officer'}</p>
          </div>
          <div>
            <p className="mb-6">Before me:</p>
            <p className="border-t border-foreground/40 pt-1">Magistrate (before plea)</p>
          </div>
        </section>
      </div>
    </article>
  )
}
