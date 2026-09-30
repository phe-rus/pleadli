import type { FoundCharge, FoundCustody, FoundPerson } from '@/features/assist/data'
import { createCustody } from '@/features/custody/data'
import { custodyKindLabel } from '@/features/custody/custody-panel'
import { formatDate } from '@/lib/dates'
import { createCharge } from '@/features/charges/data'
import { createPerson } from '@/features/people/data'
import { linkPersonToFile } from '@/features/prosecution-files/data'
import { filePersonRoles } from '@/features/prosecution-files/schema'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

const roleLabel = (role: string) => filePersonRoles.find((r) => r.value === role)?.label ?? role

/** What Assist found in the papers besides the documents: the people and the
 * charge the police proposed. Nothing is added until the prosecutor ticks it
 * and presses the button; then the file's cover and next step fill in. */
export function FillFromPapers({ fileId, people, charges, custody = [], onDone }: { fileId: string; people: FoundPerson[]; charges: FoundCharge[]; custody?: FoundCustody[]; onDone: () => void }) {
  const [pick, setPick] = useState(() => new Set([...people.map((_, i) => `p${i}`), ...charges.map((_, i) => `c${i}`), ...custody.map((_, i) => `k${i}`)]))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const toggle = (key: string) => setPick((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key])))

  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      const ids = new Map<string, string>()
      for (const [i, p] of people.entries()) {
        if (!pick.has(`p${i}`)) continue
        const person = await createPerson({ firstName: p.firstName, lastName: p.lastName, otherNames: '', phone: '', nationalId: '', address: '' })
        await linkPersonToFile(fileId, person.id, p.role)
        ids.set(p.lastName.toLowerCase(), person.id)
      }
      for (const [i, k] of custody.entries()) {
        const at = Date.parse(k.at)
        if (!pick.has(`k${i}`) || Number.isNaN(at)) continue
        await createCustody({ prosecutionFileId: fileId, kind: k.kind, at, personName: k.person || null })
      }
      for (const [i, c] of charges.entries()) {
        if (!pick.has(`c${i}`)) continue
        await createCharge({ prosecutionFileId: fileId, accusedPersonId: ids.get(c.accused.toLowerCase()) ?? null, offence: c.offence, statutorySection: c.section, particulars: c.particulars })
      }
      await Promise.all(['file-people', 'charges', 'prosecution-file', 'workload', 'people', 'custody'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
      await queryClient.invalidateQueries()
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (people.length === 0 && charges.length === 0 && custody.length === 0) return null
  return (
    <div className="flex flex-col gap-3 text-left">
      <strong>{m["import.found_title"]()}</strong>
      <p className="text-muted-foreground">{m["import.found_body"]()}</p>
      <ul className="flex list-none flex-col gap-1 p-0">
        {people.map((p, i) => (
          <li key={`p${i}`}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/50">
              <Checkbox checked={pick.has(`p${i}`)} onCheckedChange={() => toggle(`p${i}`)} />
              <span className="flex-1">
                {p.firstName} {p.lastName}
              </span>
              <span className="text-xs text-muted-foreground">{roleLabel(p.role)}</span>
            </label>
          </li>
        ))}
        {custody.map((k, i) => (
          <li key={`k${i}`}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/50">
              <Checkbox checked={pick.has(`k${i}`)} onCheckedChange={() => toggle(`k${i}`)} />
              <span className="flex-1">
                {custodyKindLabel(k.kind)}
                {k.person ? ` · ${k.person}` : ''}
              </span>
              <span className="text-xs text-muted-foreground">{Number.isNaN(Date.parse(k.at)) ? k.at : formatDate(Date.parse(k.at), 'datetime')}</span>
            </label>
          </li>
        ))}
        {charges.map((c, i) => (
          <li key={`c${i}`}>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/50">
              <Checkbox checked={pick.has(`c${i}`)} onCheckedChange={() => toggle(`c${i}`)} className="mt-0.5" />
              <span className="flex flex-1 flex-col">
                <span>{c.offence}</span>
                {c.section && <span className="text-xs text-muted-foreground">{c.section}</span>}
              </span>
              <span className="text-xs text-muted-foreground">{m["import.proposed_charge"]()}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="not-typeset text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={busy}>
          {m["import.not_now"]()}
        </Button>
        <Button onClick={add} disabled={busy || pick.size === 0}>
          {m["import.add_found"]()}
        </Button>
      </div>
    </div>
  )
}
