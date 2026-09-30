import { formatDate } from '@/lib/dates'
import { useJurisdiction } from '@/features/installation'
import * as m from '@/paraglide/messages'
import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { useId, useState } from 'react'
import { hearingKinds, type Hearing, type HearingKind } from './data'
import { useCreateFiling, useDeleteFiling, useDeleteHearing, useFilings, useHearings, useSaveHearing } from './queries'

export const hearingKindLabel = (kind: string) =>
  (
    ({
      mention: m["court.kind.mention"],
      plea: m["court.kind.plea"],
      bail: m["court.kind.bail"],
      hearing: m["court.kind.hearing"],
      trial: m["court.kind.trial"],
      ruling: m["court.kind.ruling"],
      judgment: m["court.kind.judgment"],
      sentence: m["court.kind.sentence"],
      other: m["court.kind.other"],
    }) as Record<string, () => string>
  )[kind]?.() ?? kind

const selectClass = 'h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

/** The country's courts, offered as suggestions while typing a court. */
function CourtSuggestions({ id }: { id: string }) {
  const country = useJurisdiction()
  return (
    <datalist id={id}>
      {country?.courts.map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  )
}

function HearingForm({ fileId, lastCourt, onDone }: { fileId: string; lastCourt?: string; onDone: () => void }) {
  const list = useId()
  const [court, setCourt] = useState(lastCourt ?? '')
  const [kind, setKind] = useState<HearingKind>('mention')
  const [day, setDay] = useState('')
  const [time, setTime] = useState('09:00')
  const [note, setNote] = useState('')
  const save = useSaveHearing()
  return (
    <form
      className="flex flex-col gap-3 rounded-xl bg-secondary/50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!court.trim() || !day) return
        save.mutate(
          { input: { prosecutionFileId: fileId, court: court.trim(), kind, startsAt: new Date(`${day}T${time || '09:00'}:00`).getTime(), note: note.trim() || null } },
          { onSuccess: onDone },
        )
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.court"]()}</span>
          <Input list={list} value={court} onChange={(e) => setCourt(e.target.value)} autoFocus />
          <CourtSuggestions id={list} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.what"]()}</span>
          <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as HearingKind)}>
            {hearingKinds.map((k) => (
              <option key={k} value={k}>
                {hearingKindLabel(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.date"]()}</span>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.time"]()}</span>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <Input placeholder={m["court.note_placeholder"]()} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {m["common.cancel"]()}
        </Button>
        <Button type="submit" size="sm" disabled={!court.trim() || !day || save.isPending}>
          {m["court.add_hearing"]()}
        </Button>
      </div>
    </form>
  )
}

function OutcomeField({ hearing }: { hearing: Hearing }) {
  const [value, setValue] = useState(hearing.outcome ?? '')
  const save = useSaveHearing()
  return (
    <Input
      value={value}
      placeholder={m["court.outcome_placeholder"]()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() =>
        value !== (hearing.outcome ?? '') &&
        save.mutate({ id: hearing.id, input: { prosecutionFileId: hearing.prosecutionFileId, court: hearing.court, kind: hearing.kind, startsAt: hearing.startsAt, note: hearing.note, outcome: value.trim() || null } })
      }
      className="h-8"
    />
  )
}

function FilingForm({ fileId, lastCourt, onDone }: { fileId: string; lastCourt?: string; onDone: () => void }) {
  const list = useId()
  const [what, setWhat] = useState('')
  const [court, setCourt] = useState(lastCourt ?? '')
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10))
  const [receipt, setReceipt] = useState('')
  const create = useCreateFiling()
  return (
    <form
      className="flex flex-col gap-3 rounded-xl bg-secondary/50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!what.trim() || !court.trim()) return
        create.mutate({ prosecutionFileId: fileId, what: what.trim(), court: court.trim(), filedAt: new Date(`${day}T12:00:00`).getTime(), receipt: receipt.trim() || null }, { onSuccess: onDone })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.filed_what"]()}</span>
          <Input value={what} onChange={(e) => setWhat(e.target.value)} placeholder={m["court.filed_what_placeholder"]()} autoFocus />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.court"]()}</span>
          <Input list={list} value={court} onChange={(e) => setCourt(e.target.value)} />
          <CourtSuggestions id={list} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.filed_on"]()}</span>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m["court.receipt"]()}</span>
          <Input value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder={m["court.receipt_placeholder"]()} />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {m["common.cancel"]()}
        </Button>
        <Button type="submit" size="sm" disabled={!what.trim() || !court.trim() || create.isPending}>
          {m["court.add_filing"]()}
        </Button>
      </div>
    </form>
  )
}

/** A file's life in court: the hearings, coming and past, and the filing
 * register. The next hearing is also on the file's cover and the Calendar. */
export function CourtRecord({ fileId }: { fileId: string }) {
  const { data: hearings = [] } = useHearings(fileId)
  const { data: filings = [] } = useFilings(fileId)
  const removeHearing = useDeleteHearing()
  const removeFiling = useDeleteFiling()
  const [adding, setAdding] = useState<'hearing' | 'filing' | null>(null)
  const now = Date.now() - 12 * 3_600_000
  const coming = hearings.filter((h) => h.startsAt >= now)
  const past = hearings.filter((h) => h.startsAt < now).reverse()
  const lastCourt = hearings[hearings.length - 1]?.court ?? filings[0]?.court

  return (
    <div className="flex flex-col gap-6">
      <section className="page-section">
        <div className="section-head">
          <h2>{m["court.hearings"]()}</h2>
          {adding !== 'hearing' && (
            <Button size="sm" variant="secondary" onClick={() => setAdding('hearing')}>
              <HugeiconsIcon icon={Add01Icon} />
              {m["court.add_hearing"]()}
            </Button>
          )}
        </div>
        {adding === 'hearing' && <HearingForm fileId={fileId} lastCourt={lastCourt} onDone={() => setAdding(null)} />}
        {hearings.length === 0 && adding !== 'hearing' ? (
          <p className="text-muted-foreground">{m["court.no_hearings"]()}</p>
        ) : (
          <ol className="flex list-none flex-col gap-2 p-0">
            {[...coming, ...past].map((h) => {
              const upcoming = h.startsAt >= now
              return (
                <li key={h.id} className={cn('group/h flex items-start gap-4 rounded-xl p-3 ring-1 ring-border/60', upcoming ? 'bg-card' : 'bg-transparent')}>
                  <div className={cn('flex w-14 shrink-0 flex-col items-center rounded-lg py-1', upcoming ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground')}>
                    <span className="text-xs uppercase">{formatDate(h.startsAt, 'monthShort')}</span>
                    <strong className="text-lg leading-none tabular-nums">{new Date(h.startsAt).getDate()}</strong>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <strong>{hearingKindLabel(h.kind)}</strong>
                      <span className="text-muted-foreground">
                        {h.court}, {formatDate(h.startsAt, 'time')}
                      </span>
                    </div>
                    {h.note && <p className="text-muted-foreground">{h.note}</p>}
                    {!upcoming && <OutcomeField hearing={h} />}
                  </div>
                  <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover/h:opacity-100" onClick={() => removeHearing.mutate(h.id)} aria-label={m["court.remove"]()}>
                    <HugeiconsIcon icon={Delete02Icon} />
                  </Button>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="page-section">
        <div className="section-head">
          <h2>{m["court.filings"]()}</h2>
          {adding !== 'filing' && (
            <Button size="sm" variant="secondary" onClick={() => setAdding('filing')}>
              <HugeiconsIcon icon={Add01Icon} />
              {m["court.add_filing"]()}
            </Button>
          )}
        </div>
        {adding === 'filing' && <FilingForm fileId={fileId} lastCourt={lastCourt} onDone={() => setAdding(null)} />}
        {filings.length === 0 && adding !== 'filing' ? (
          <p className="text-muted-foreground">{m["court.no_filings"]()}</p>
        ) : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {filings.map((f) => (
              <div key={f.id} role="listitem" className="group/f flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{f.what}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {f.court}, {formatDate(f.filedAt)}
                    {f.receipt ? `. ${m["court.receipt"]()}: ${f.receipt}` : ''}
                  </span>
                </div>
                <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover/f:opacity-100" onClick={() => removeFiling.mutate(f.id)} aria-label={m["court.remove"]()}>
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
