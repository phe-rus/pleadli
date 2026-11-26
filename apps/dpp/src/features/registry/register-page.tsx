import { ChoiceSelect } from '@/components/choice-select'
import { filesOptions } from '@/features/prosecution-files/queries'
import { fileReference } from '@/features/prosecution-files/schema'
import { staffOptions } from '@/features/installation/queries'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { registers, type RegisterEntry, type RegisterId } from './data'
import { useEntries, useGiveOut, useHolders, useStamp, useYears } from './queries'

const registerLabel = (r: RegisterId) => ({ incoming: m["registers.incoming"], outgoing: m["registers.outgoing"], movement: m["registers.movement"] })[r]()
const selectClass = 'h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

function GiveOut() {
  const { data: files = [] } = useQuery(filesOptions('all'))
  const { data: staff = [] } = useQuery(staffOptions())
  const give = useGiveOut()
  const [file, setFile] = useState('')
  const [who, setWho] = useState('')
  const [outside, setOutside] = useState('')
  const [note, setNote] = useState('')
  const ready = file && (who || outside.trim())
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl bg-secondary/50 p-4 print:hidden"
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready) return
        give.mutate({ prosecutionFileId: file, staffId: who || null, givenTo: who ? null : outside, note }, { onSuccess: () => { setFile(''); setWho(''); setOutside(''); setNote('') } })
      }}
    >
      <strong>{m["registers.give_out"]()}</strong>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["registers.file"]()}</span>
          <ChoiceSelect className={selectClass} value={file} onChange={(e) => setFile(e.target.value)}>
            <option value="" />
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {fileReference(f)} · {f.title}
              </option>
            ))}
          </ChoiceSelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["registers.to_staff"]()}</span>
          <ChoiceSelect className={selectClass} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="" />
            {staff.filter((s) => s.active).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </ChoiceSelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["registers.to_outside"]()}</span>
          <Input value={outside} disabled={!!who} onChange={(e) => setOutside(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["registers.note"]()}</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {give.isError && <p className="not-typeset text-destructive">{give.error.message}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!ready || give.isPending}>
          {m["registers.record_give_out"]()}
        </Button>
      </div>
    </form>
  )
}

function StampCell({ entry }: { entry: RegisterEntry }) {
  const stamp = useStamp()
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  return (
    <div className="flex flex-col gap-1">
      {entry.stamps.map((s, i) => (
        <span key={i} className="w-fit rounded border border-border px-1.5 py-0.5 text-xs">
          {s.label} · {s.by ?? '?'} · {formatDate(s.at)}
        </span>
      ))}
      {adding ? (
        <form
          className="flex gap-1 print:hidden"
          onSubmit={(e) => {
            e.preventDefault()
            if (label.trim()) stamp.mutate({ id: entry.id, label }, { onSuccess: () => { setLabel(''); setAdding(false) } })
          }}
        >
          <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder={m["registers.stamp_placeholder"]()} className="h-7" />
          <Button size="xs" type="submit">
            {m["registers.stamp_save"]()}
          </Button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="w-fit cursor-pointer text-xs text-primary print:hidden">
          {m["registers.stamp"]()}
        </button>
      )}
    </div>
  )
}

/** The Registry: one page, three registers as tabs, numbered per year and
 * printable as they stand. Below the book, who holds what and the places the
 * registry also reaches (stations, courts, postbox, people, workload). */
export function RegisterPage({ register }: { register: RegisterId }) {
  const { data: years = [] } = useYears()
  const [picked, setPicked] = useState<number | null>(null)
  const year = picked ?? years[0] ?? new Date().getFullYear()
  const { data: entries = [] } = useEntries(register, year)
  const { data: holders = [] } = useHolders()
  const { data: incomingBook = [] } = useEntries('incoming', year)
  const { data: outgoingBook = [] } = useEntries('outgoing', year)
  const { data: movementBook = [] } = useEntries('movement', year)
  const counts: Record<string, number> = { incoming: incomingBook.length, outgoing: outgoingBook.length, movement: movementBook.length }
  const toFrom = register === 'incoming' ? m["registers.from"]() : register === 'outgoing' ? m["registers.to"]() : m["registers.given_to"]()
  const th = 'py-2 pr-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'
  const tab = (active: boolean) => cn('relative h-9 px-3 text-[0.8125rem] leading-9 no-underline transition-colors', active ? 'font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground')

  return (
    <article className="page register-print">
      <style>{`@media print { body * { visibility: hidden } .register-print, .register-print * { visibility: visible } .register-print { position: absolute; inset: 0; padding: 1rem } }`}</style>
      <header className="page-header">
        <div>
          <h1>{m["nav.item.registry"]()}</h1>
          <p>{m["registers.page_about"]()}</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <ChoiceSelect className={selectClass} value={String(year)} onChange={(e) => setPicked(Number(e.target.value))} aria-label={m["registers.year"]()}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </ChoiceSelect>
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            {m["registers.print_today"]()}
          </Button>
          <Button size="sm" render={<Link to="/incoming" />}>
            {m["registers.receive_file"]()}
          </Button>
        </div>
      </header>

      <nav role="tablist" className="flex flex-wrap items-center gap-1 border-b border-border/40 print:hidden">
        {registers.map((r) => (
          <Link key={r} to="/registry/$register" params={{ register: r }} className={tab(r === register)}>
            {registerLabel(r)}
            <span className="ms-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[0.6875rem] tabular-nums text-muted-foreground">{counts[r] ?? 0}</span>
          </Link>
        ))}
        <Link to="/connections" className={tab(false)}>
          {m["registers.stations_courts"]()}
        </Link>
      </nav>

      {register === 'movement' && <GiveOut />}

      <div className="overflow-x-auto">
      <table className="w-full min-w-[72rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={th}>{m["registers.no"]()}</th>
            <th className={th}>{m["registers.date"]()}</th>
            <th className={th}>{toFrom}</th>
            <th className={th}>{m["registers.police_ref"]()}</th>
            <th className={th}>{m["registers.file"]()}</th>
            <th className={th}>{m["registers.odpp_no"]()}</th>
            <th className={th}>{m["registers.stamps"]()}</th>
            <th className={th}>{m["registers.by"]()}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-border/50 align-top">
              <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">{String(e.number).padStart(4, '0')}</td>
              <td className="py-2.5 pr-3 whitespace-nowrap">{formatDate(e.occurredAt, 'datetime')}</td>
              <td className="min-w-44 py-2.5 pr-4">
                {e.givenTo ?? e.fromTo ?? ''}
                {e.note && <span className="block text-xs text-muted-foreground">{e.note}</span>}
              </td>
              <td className="py-2.5 pr-3 whitespace-nowrap">{e.policeReference ?? ''}</td>
              <td className="min-w-56 py-2.5 pr-4">
                <Link to="/files/$fileId" params={{ fileId: e.prosecutionFileId }} className="font-semibold no-underline">
                  {e.fileTitle}
                </Link>
              </td>
              <td className="py-2.5 pr-3 whitespace-nowrap">{e.odppRegistrationNumber ?? ''}</td>
              <td className="py-2.5 pr-3">
                <StampCell entry={e} />
              </td>
              <td className="py-2.5 pr-3">{e.actor ?? m["registers.unrecorded"]()}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={8} className="py-6 text-muted-foreground">
                {m["registers.empty"]()}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      <p className="text-sm text-muted-foreground">{m["registers.stamp_note"]()}</p>

      <div className="flex flex-wrap items-stretch gap-4 print:hidden">
        <section className="flex min-w-0 flex-1 basis-64 flex-col gap-2 rounded-2xl border border-border p-5">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground">{m["registers.who_has_title"]()}</h2>
          {holders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m["registers.nobody"]()}</p>
          ) : (
            <ul className="flex list-none flex-col gap-1 p-0 text-sm">
              {holders.map((h) => (
                <li key={h.staffId ?? 'none'}>
                  {h.name ?? m["registers.nobody"]()}: <strong>{h.files}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex min-w-0 flex-1 basis-64 flex-col gap-2 rounded-2xl border border-border p-5">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground">{m["registers.stations_courts_title"]()}</h2>
          <p className="text-sm">{m["registers.stations_courts_body"]()}</p>
          <div className="flex gap-4 text-sm">
            <Link to="/connections">{m["registry.stations"]()}</Link>
            <Link to="/courts">{m["registry.courts"]()}</Link>
          </div>
        </section>
        <section className="flex min-w-0 flex-1 basis-64 flex-col gap-2 rounded-2xl border border-border p-5">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground">{m["registers.more_title"]()}</h2>
          <div className="flex flex-col gap-1 text-sm">
            <Link to="/postbox">{m["registry.postbox"]()}</Link>
            <Link to="/people">{m["registry.people"]()}</Link>
            <Link to="/capacity">{m["registry.workload"]()}</Link>
            <Link to="/reports">{m["registry.statistics"]()}</Link>
          </div>
        </section>
      </div>
    </article>
  )
}
