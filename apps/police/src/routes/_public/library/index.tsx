import * as m from '@/paraglide/messages'
import { PoliceRecordsLibrary } from '@/features/library/records-library'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/library/')({ component: RouteComponent })

/** The Library: reach and consult what the station has recorded and kept. Preparing, printing and
 * sending paperwork is Documents; this place is for finding the record. */
function RouteComponent() {
  return (
    <article className="page">
      <header className="page-header">
        <h1>{m['nav.library']()}</h1>
      </header>
      <PoliceRecordsLibrary />
    </article>
  )
}
