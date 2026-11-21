import { Segmented } from './segmented'

export type ZoneStatusView = {
  country: string
  zoneId: string | null
  choices: string[]
  nowShown: string
  clockWarnings: { kind: 'beforeRelease' | 'behindRecords' | 'farAhead' }[]
}

export type TimezoneLabels = {
  title: string
  about: string
  label: string
  hint: string
  notSet: string
  notSetHint: string
  adminOnly: string
  nowLabel: string
  clockTitle: string
  clockOk: string
  clockBeforeRelease: string
  clockBehind: string
  clockFarAhead: string
}

/**
 * The institution's time zone and a warning about the computer's clock, the same in every Pleadli app (each
 * passes its own words). Two things on purpose: a right zone does not fix a wrong clock. Shown with plain
 * semantic tags so the app's global typography styles it.
 */
export function TimezonePanel({ status, canChange, busy, onChange, labels }: { status: ZoneStatusView; canChange: boolean; busy?: boolean; onChange: (zoneId: string) => void; labels: TimezoneLabels }) {
  const clock = { beforeRelease: labels.clockBeforeRelease, behindRecords: labels.clockBehind, farAhead: labels.clockFarAhead }
  return (
    <section aria-labelledby="timezone-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 id="timezone-title">{labels.title}</h3>
        <p className="text-muted-foreground">{labels.about}</p>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <span>{labels.label}</span>
            <p className="text-[0.8125rem] text-muted-foreground">{status.zoneId ? (canChange ? labels.hint : labels.adminOnly) : labels.notSetHint}</p>
          </div>
          {canChange && status.choices.length > 1 ? (
            <fieldset disabled={busy} className="contents">
              <Segmented label={labels.label} value={status.zoneId ?? ''} onChange={onChange} items={status.choices.map((zone) => ({ value: zone, label: zone.split('/')[1] ?? zone }))} />
            </fieldset>
          ) : (
            <span className="text-muted-foreground">{status.zoneId ?? labels.notSet}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
          <span>{labels.nowLabel}</span>
          <span className="text-muted-foreground tabular-nums">{status.nowShown}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-4">
        <h3>{labels.clockTitle}</h3>
        {status.clockWarnings.length === 0 ? (
          <p className="text-muted-foreground">{labels.clockOk}</p>
        ) : (
          status.clockWarnings.map((w) => (
            <p key={w.kind} role="alert" className="text-destructive">
              {clock[w.kind]}
            </p>
          ))
        )}
      </div>
    </section>
  )
}
