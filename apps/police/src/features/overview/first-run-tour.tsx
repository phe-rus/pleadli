import * as m from '@/paraglide/messages'
import { custodyLimits } from '@/features/custody/schema'
import { useMe } from '@/features/session'
import { parseSearchRoute } from '@/lib/parse-search-route'
import { Button } from '@pleadli/ui/button'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

/** The five places a new officer meets first, in the order a case is worked. */
const steps = [
  { title: () => m["tour.s1_title"](), body: () => m["tour.s1_body"](custodyLimits()), to: null },
  { title: () => m["tour.s2_title"](), body: () => m["tour.s2_body"](), to: '/search/people' },
  { title: () => m["tour.s3_title"](), body: () => m["tour.s3_body"](), to: '/investigations' },
  { title: () => m["tour.s4_title"](), body: () => m["tour.s4_body"](custodyLimits()), to: '/search/custody' },
  { title: () => m["tour.s5_title"](), body: () => m["tour.s5_body"](), to: null },
]

const keyFor = (officerId: string) => `pleadli-police-tour-done:${officerId}`

function isDone(officerId: string) {
  try {
    return localStorage.getItem(keyFor(officerId)) === 'true'
  } catch {
    return false
  }
}

/** Forget that the tour was finished, so it shows again on Today. */
export function restartTour(officerId: string) {
  try {
    localStorage.removeItem(keyFor(officerId))
  } catch {
    // storage unavailable: the tour simply stays as it is
  }
}

/** A short, skippable tour shown once per officer at the top of Today. Finishing or skipping it is
 * remembered on this machine; Settings can bring it back. */
export function FirstRunTour() {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [closed, setClosed] = useState(false)
  if (!me || closed || isDone(me.officerId)) return null

  const current = steps[step]
  const last = step === steps.length - 1
  const finish = () => {
    try {
      localStorage.setItem(keyFor(me.officerId), 'true')
    } catch {
      // not remembered, so it may show again next time
    }
    setClosed(true)
  }

  return (
    <section aria-label={m["tour.title"]()} className="flex flex-col gap-2 rounded-xl bg-primary/[0.06] p-4 ring-1 ring-primary/20">
      <p className="text-[0.8125rem] font-medium text-muted-foreground">
        {m["tour.title"]()} · {m["tour.step_of"]({ n: step + 1, total: steps.length })}
      </p>
      <h2>{current.title()}</h2>
      <p>{current.body()}</p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button onClick={() => (last ? finish() : setStep(step + 1))}>{last ? m["tour.done"]() : m["tour.next"]()}</Button>
        {current.to && (
          <Button variant="secondary" onClick={() => void navigate(parseSearchRoute(current.to) as never)}>
            {m["tour.go"]()}
          </Button>
        )}
        {!last && (
          <Button variant="ghost" onClick={finish}>
            {m["tour.skip"]()}
          </Button>
        )}
      </div>
    </section>
  )
}
