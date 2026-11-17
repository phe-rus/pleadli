import { CourtsToday, courtsAccent } from './courts-today'
import { DppToday, dppAccent } from './dpp-today'
import { LawyersToday, lawyersAccent } from './lawyers-today'
import { PoliceToday } from './police-today'
import { PrisonsToday, prisonsAccent } from './prisons-today'
import { ScaledWindow } from './scaled-window'

/** An app's window: a live, clickable replica of the desktop app. */
export function ProductWindow({ slug }: { slug: string; name?: string; index?: number; priority?: boolean }) {
  switch (slug) {
    case 'police': return <ScaledWindow><PoliceToday /></ScaledWindow>
    case 'dpp': return <ScaledWindow accent={dppAccent}><DppToday /></ScaledWindow>
    case 'courts': return <ScaledWindow accent={courtsAccent}><CourtsToday /></ScaledWindow>
    case 'lawyers': return <ScaledWindow accent={lawyersAccent}><LawyersToday /></ScaledWindow>
    case 'prisons': return <ScaledWindow accent={prisonsAccent}><PrisonsToday /></ScaledWindow>
    default: return null
  }
}
