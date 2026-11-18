import { CourtsToday, courtsAccent } from './courts-today'
import { DppToday, dppAccent } from './dpp-today'
import { LawyersToday, lawyersAccent } from './lawyers-today'
import { PoliceToday } from './police-today'
import { PrisonsToday, prisonsAccent } from './prisons-today'
import { ScaledWindow, type Region } from './scaled-window'

/** An app's window: a live, clickable replica of the desktop app. A region shows only part of it. */
export function ProductWindow({ slug, region, bare }: { slug: string; name?: string; index?: number; priority?: boolean; region?: Region; bare?: boolean }) {
  switch (slug) {
    case 'police': return <ScaledWindow bare={bare} region={region}><PoliceToday /></ScaledWindow>
    case 'dpp': return <ScaledWindow bare={bare} region={region} accent={dppAccent}><DppToday /></ScaledWindow>
    case 'courts': return <ScaledWindow bare={bare} region={region} accent={courtsAccent}><CourtsToday /></ScaledWindow>
    case 'lawyers': return <ScaledWindow bare={bare} region={region} accent={lawyersAccent}><LawyersToday /></ScaledWindow>
    case 'prisons': return <ScaledWindow bare={bare} region={region} accent={prisonsAccent}><PrisonsToday /></ScaledWindow>
    default: return null
  }
}
