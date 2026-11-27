import * as m from '@/paraglide/messages'
import { CasePicker } from '@/components/case-picker'
import { SettingsCard } from '@/components/settings-card'
import { format } from '@/lib/date'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { Input } from '@pleadli/ui/input'
import { useState } from 'react'
import { matchMinute, saveServiceReport, savePackage, sendServiceReport, type HearingMinute, type Incoming, type ServiceResult } from './data'

const parse = (payload: string): HearingMinute | null => {
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

type Props = {
  minutes: Incoming[]
  /** `needs_review` until an officer matches the minute to its case. */
  canPostbox: boolean
  run: (work: () => Promise<string | void>) => Promise<void>
}

/** Minutes the office sent after a hearing. Each one is a short list of jobs: match it to its case, then say which
 * witnesses were served and why not, and send that back. */
export function MinutesCard({ minutes, canPostbox, run }: Props) {
  if (minutes.length === 0) return null
  return (
    <SettingsCard title={m['minutes.title']()} description={m['minutes.hint']()}>
      {minutes.map((i) => (
        <Minute key={i.id} incoming={i} canPostbox={canPostbox} run={run} />
      ))}
    </SettingsCard>
  )
}

function Minute({ incoming, canPostbox, run }: { incoming: Incoming & { status?: string }; canPostbox: boolean; run: Props['run'] }) {
  const minute = parse(incoming.payload)
  const held = incoming.status === 'needs_review'
  const [caseId, setCaseId] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<string, { served: boolean; reason: string }>>({})
  if (!minute) return null
  const witnesses = minute.witnessesToServe ?? []
  const row = (name: string) => rows[name] ?? { served: true, reason: '' }
  const results = (): ServiceResult[] => witnesses.map((w) => ({ name: w.name, served: row(w.name).served, reason: row(w.name).served ? null : row(w.name).reason.trim(), servedAt: null }))
  const ready = witnesses.length > 0 && witnesses.every((w) => row(w.name).served || row(w.name).reason.trim())

  return (
    <div className="flex flex-col gap-3 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-col">
          <span>
            {minute.policeReference} <span className="text-muted-foreground">· {incoming.officeName} · {format(minute.heardAt, 'PP')}</span>
          </span>
          <span className="text-muted-foreground">
            {[minute.courtCaseNumber, minute.adjournmentCause, minute.nextDate ? m['minutes.next_date']({ date: format(minute.nextDate, 'PP') }) : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        {held && <Badge variant="destructive">{m['minutes.needs_case']()}</Badge>}
      </div>

      {minute.note && <p className="text-muted-foreground">{minute.note}</p>}
      {minute.exhibitsToProduce?.length > 0 && <p>{m['minutes.exhibits']({ list: minute.exhibitsToProduce.join(', ') })}</p>}

      {held ? (
        <div className="flex flex-wrap items-center gap-2">
          <CasePicker value={caseId} onValueChange={setCaseId} />
          <Button size="sm" disabled={!caseId} onClick={() => run(async () => { await matchMinute(incoming.id, caseId!); return m['minutes.matched']() })}>
            {m['minutes.match']()}
          </Button>
        </div>
      ) : (
        witnesses.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground">{m['minutes.serve_heading']()}</span>
            {witnesses.map((w) => (
              <div key={w.name} className="flex flex-wrap items-center gap-3">
                <label className="flex min-w-48 items-center gap-2">
                  <Checkbox checked={row(w.name).served} onCheckedChange={(v) => setRows({ ...rows, [w.name]: { ...row(w.name), served: v === true } })} />
                  <span>{w.name}{w.role ? <span className="text-muted-foreground"> · {w.role}</span> : null}</span>
                </label>
                {row(w.name).served ? (
                  <span className="text-muted-foreground">{m['minutes.served']()}</span>
                ) : (
                  <Input aria-label={m['minutes.why_not']()} placeholder={m['minutes.why_not']()} value={row(w.name).reason} onChange={(e) => setRows({ ...rows, [w.name]: { ...row(w.name), reason: e.target.value } })} className="w-full sm:w-72" />
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!ready || !canPostbox} onClick={() => run(async () => { await sendServiceReport(incoming.id, results()); return m['relay.queued']() })}>
                {m['relay.send_postbox']()}
              </Button>
              <Button size="sm" variant="secondary" disabled={!ready} onClick={() => run(async () => { const sealed = await saveServiceReport(incoming.id, results()); if (await savePackage(sealed)) return m['exchange.sent_file']({ name: sealed.name }) })}>
                {m['exchange.save_file']()}
              </Button>
            </div>
          </div>
        )
      )}
    </div>
  )
}
