import type { Charge } from '@/features/charges'
import type { ProsecutionFile } from '@/features/prosecution-files'
import type { Decision } from './schema'
import { format } from 'date-fns/format'

export type ChargeSheetPrintableProps = {
  file: ProsecutionFile
  charges: Charge[]
  decision: Decision
  accusedName: string | null
  preferredByName: string | null
}

/**
 * DPP's own sanctioned Charge Sheet (docs/dpp/PRODUCT.md's "resulting
 * document" gap, RESEARCH.md §3/§6): generated from the Prosecution File's
 * own structured data (the file, its proposed charges, the sanction
 * decision), never retyped. Confirmed real fields (RESEARCH.md, Justice
 * Centres Uganda + ODPP's own Guidelines): heading, date, police station,
 * criminal register number, accused's name, statement/particulars of
 * offence per count, and the Prosecutor's own sanctioning act ("shall
 * sanction the charges by appending his or her signature, date, and stamp
 * on the Charge Sheet") as a distinct signature block from Police's own
 * "Preferred by" line.
 */
export function ChargeSheetPrintable({ file, charges, decision, accusedName, preferredByName }: ChargeSheetPrintableProps) {
  return (
    <div className="mx-auto w-full max-w-2xl rounded-md border border-border/60 bg-card p-8 text-sm leading-relaxed print:rounded-none print:border-none">
      <header className="mb-6 text-center">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">Office of the Director of Public Prosecutions</p>
        <h1 className="text-base font-semibold tracking-wide uppercase">Charge Sheet</h1>
      </header>

      <section className="mb-5 grid grid-cols-2 gap-2 border-b border-border/60 pb-4 text-xs">
        <div>
          <span className="text-muted-foreground">Police station: </span>
          {file.policeStation ?? '·'}
        </div>
        <div className="text-right">
          <span className="text-muted-foreground">Date: </span>
          {format(decision.decidedAt, 'PPP')}
        </div>
        <div>
          <span className="text-muted-foreground">Criminal register no.: </span>
          {file.policeReference ?? '·'}
        </div>
        <div className="text-right">
          <span className="text-muted-foreground">ODPP reg. no.: </span>
          {file.odppRegistrationNumber ?? '·'}
        </div>
        <div className="col-span-2">
          <span className="text-muted-foreground">Accused: </span>
          {accusedName ?? '·'}
        </div>
        {file.courtCaseNumber && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Court case no.: </span>
            {file.courtCaseNumber}
          </div>
        )}
      </section>

      {charges.length === 0 ? (
        <p className="mb-5 text-xs text-muted-foreground">No charges recorded on this file.</p>
      ) : (
        charges.map((charge, index) => (
          <section key={charge.id} className="mb-5">
            <h2 className="mb-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground">
              Count {index + 1}: Statement of Offence
            </h2>
            <p>
              {charge.offence}
              {charge.statutorySection ? `, contrary to ${charge.statutorySection}.` : '.'}
            </p>
            {charge.particulars && (
              <>
                <h2 className="mt-3 mb-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground">Particulars of Offence</h2>
                <p className="whitespace-pre-wrap">{charge.particulars}</p>
              </>
            )}
          </section>
        ))
      )}

      <section className="mt-8 flex items-end justify-between border-t border-border/60 pt-4 text-xs">
        <div>
          <p className="mb-6">Preferred by:</p>
          <p className="border-t border-foreground/40 pt-1">{preferredByName ?? 'Signature of preferring officer'}</p>
        </div>
        <div>
          <p className="mb-6">Sanctioned by (signature, date, and stamp):</p>
          <p className="border-t border-foreground/40 pt-1">{decision.decidedBy ?? 'Signature of Prosecutor'}</p>
        </div>
      </section>
    </div>
  )
}
