import { format } from 'date-fns/format'
import { chargeSheetAccusedName } from './schema'
import type { ChargeSheet } from './schema'

/** The PF 53 charge card, shared by the interactive charge sheet page
 * and its `/print` route, so the two never drift apart. */
export function ChargeSheetPrintable({ chargeSheet }: { chargeSheet: ChargeSheet }) {
  const accusedName = chargeSheetAccusedName(chargeSheet)

  return (
    <div className="mx-auto w-full max-w-2xl rounded-md border border-border/60 bg-card p-8 text-sm leading-relaxed print:rounded-none print:border-none">
      <header className="mb-6 text-center">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">Uganda Police Force</p>
        <h1 className="text-base font-semibold tracking-wide uppercase">Charge · PF 53</h1>
      </header>

      <section className="mb-5 grid grid-cols-2 gap-2 border-b border-border/60 pb-4 text-xs">
        <div>
          <span className="text-muted-foreground">Station: </span>
          {chargeSheet.stationName || '·'}
        </div>
        <div className="text-right">
          <span className="text-muted-foreground">Date: </span>
          {format(chargeSheet.chargedAt, 'PPP')}
        </div>
        <div>
          <span className="text-muted-foreground">CRB / Case reference: </span>
          {chargeSheet.caseReference}
        </div>
        <div className="text-right">
          <span className="text-muted-foreground">Accused: </span>
          {accusedName ?? '·'}
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground">Statement of Offence</h2>
        <p>
          {chargeSheet.offence}, contrary to {chargeSheet.statutorySection}.
        </p>
      </section>

      <section className="mb-5">
        <h2 className="mb-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground">Particulars of Offence</h2>
        <p className="whitespace-pre-wrap">{chargeSheet.particulars}</p>
      </section>

      <section className="mt-8 flex items-end justify-between border-t border-border/60 pt-4 text-xs">
        <div>
          <p className="mb-6">Preferred by:</p>
          <p className="border-t border-foreground/40 pt-1">{chargeSheet.officerName || 'Signature of preferring officer'}</p>
        </div>
        <div>
          <p className="mb-6">Before me:</p>
          <p className="border-t border-foreground/40 pt-1">Magistrate (before plea)</p>
        </div>
      </section>
    </div>
  )
}
