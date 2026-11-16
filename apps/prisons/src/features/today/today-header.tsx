import { JurisdictionContext } from '@/features/jurisdiction/jurisdiction-context'
import type { TodayView } from '@/features/obligations'
import { format } from 'date-fns/format'
import type { ReactNode } from 'react'
import { m } from '@/paraglide/messages'

/** The day and the one thing to start, as DPP's Today opens. Who is signed
 * in and the Head Office link live in the sidebar's footer. */
export function TodayHeader({ today, actions }: { today: TodayView; actions: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <p className="text-[0.8125rem] font-medium text-muted-foreground">{format(today.now, 'EEEE d MMMM')}</p>
        <h1>{m.today_today()}</h1>
        <JurisdictionContext />
      </div>
      <div className="page-actions">{actions}</div>
    </header>
  )
}
