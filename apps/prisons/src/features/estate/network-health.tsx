import { present } from '@/lib/present'
import { m } from '@/paraglide/messages'
import type { Estate } from './schema'

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <h3 className="tabular-nums">{value}</h3>
      <p>{label}</p>
    </div>
  )
}

/** How many of the facilities on the roster Head Office can reach, counted
 * from when each was last heard from. It is what the estate knows and nothing
 * more: there is no live probe of a facility, so a facility is "quiet" or
 * "no contact" by how long ago it last reported, not by being tested now. */
export function NetworkHealth({ estate }: { estate: Estate }) {
  const facilities = estate.regions.flatMap((region) => region.facilities)
  const count = (contact: string) => facilities.filter((f) => f.contact === contact).length
  const awaiting = facilities.filter((f) => f.status === 'pending_verification').length
  const notes = present([awaiting > 0 && m.estate_health_awaiting({ count: awaiting }), estate.revoked > 0 && m.estate_health_revoked({ count: estate.revoked })])

  return (
    <section className="page-section" aria-labelledby="network-heading">
      <div className="section-head">
        <h2 id="network-heading">{m.estate_network_heading()}</h2>
        <p>{m.estate_as_of_each_facility()}</p>
      </div>
      {facilities.length === 0 ? (
        <p>{m.estate_no_facilities()}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border/60 py-4 sm:grid-cols-4 sm:[&>*+*]:border-l sm:[&>*+*]:border-border/60 sm:[&>*+*]:pl-6">
            <Figure value={count('current')} label={m.estate_contact_current()} />
            <Figure value={count('stale')} label={m.estate_contact_stale()} />
            <Figure value={count('silent')} label={m.estate_contact_silent()} />
            <Figure value={count('never')} label={m.estate_contact_never()} />
          </div>
          {notes.length > 0 && <p>{notes.join(' · ')}</p>}
        </>
      )}
    </section>
  )
}
