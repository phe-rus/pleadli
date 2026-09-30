import * as m from '@/paraglide/messages'
import { format } from '@/lib/date'
import { chargeSheetAccusedName } from './schema'
import type { ChargeSheet } from './schema'

/** The PF 53 charge card, shared by the interactive charge sheet page
 * and its `/print` route, so the two never drift apart. */
export function ChargeSheetPrintable({ chargeSheet }: { chargeSheet: ChargeSheet }) {
  const accusedName = chargeSheetAccusedName(chargeSheet)

  return (
    <div className="mx-auto w-full max-w-2xl rounded-md border border-border/60 bg-card p-8 text-sm leading-relaxed print:rounded-none print:border-none">
      <header className="mb-6 text-center">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{m["charge_sheet.force"]()}</p>
        <h1 className="text-base font-semibold tracking-wide uppercase">{m["charge_sheet.heading"]()}</h1>
      </header>

      <section className="mb-5 grid grid-cols-2 gap-2 border-b border-border/60 pb-4 text-xs">
        <div>
          <span className="text-muted-foreground">{m["charge_sheet.station_label"]()}</span>
          {chargeSheet.stationName || '·'}
        </div>
        <div className="text-right">
          <span className="text-muted-foreground">{m["charge_sheet.date_label"]()}</span>
          {format(chargeSheet.chargedAt, 'PPP')}
        </div>
        <div>
          <span className="text-muted-foreground">{m["charge_sheet.reference_label"]()}</span>
          {chargeSheet.caseReference}
        </div>
        <div className="text-right">
          <span className="text-muted-foreground">{m["charge_sheet.accused_label"]()}</span>
          {accusedName ?? '·'}
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground">{m["charge_sheet.statement_heading"]()}</h2>
        <p>
          {m["charge_sheet.contrary_to"]({ offence: chargeSheet.offence, section: chargeSheet.statutorySection })}
        </p>
      </section>

      <section className="mb-5">
        <h2 className="mb-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground">{m["charge_sheet.particulars_heading"]()}</h2>
        <p className="whitespace-pre-wrap">{chargeSheet.particulars}</p>
      </section>

      <section className="mt-8 flex items-end justify-between border-t border-border/60 pt-4 text-xs">
        <div>
          <p className="mb-6">{m["charge_sheet.preferred_by"]()}</p>
          <p className="border-t border-foreground/40 pt-1">{chargeSheet.officerName || m["charge_sheet.signature"]()}</p>
        </div>
        <div>
          <p className="mb-6">{m["charge_sheet.before_me"]()}</p>
          <p className="border-t border-foreground/40 pt-1">{m["charge_sheet.magistrate"]()}</p>
        </div>
      </section>
    </div>
  )
}
