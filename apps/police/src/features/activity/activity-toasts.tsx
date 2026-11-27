import * as m from '@/paraglide/messages'
import { parseSearchRoute } from '@/lib/parse-search-route'
import { t } from '@pleadli/ui/goey-toaster'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useRecentActivity } from './queries'
import { isHighSignalActivity } from './schema'

/** A toast is for what the officer should not miss, not a log of everything
 * saved (the activity panel on Today is the log). So: only high-signal
 * records toast, never retroactively, and everything new in one check is ONE
 * toast: the item itself when there is one, else a count. Nothing is toasted
 * more than once per 20 seconds. */
const QUIET_MS = 20_000

export function ActivityToasts() {
  const { data } = useRecentActivity()
  const navigate = useNavigate()
  const seen = useRef<Set<string> | null>(null)
  const lastAt = useRef(0)

  useEffect(() => {
    if (!data) return

    if (seen.current === null) {
      seen.current = new Set(data.map((item) => item.id))
      return
    }

    const fresh = data.filter((item) => !seen.current!.has(item.id))
    for (const item of fresh) seen.current.add(item.id)
    const loud = fresh.filter(isHighSignalActivity)
    if (loud.length === 0 || Date.now() - lastAt.current < QUIET_MS) return
    lastAt.current = Date.now()

    if (loud.length === 1) {
      const item = loud[0]
      t.info(item.title, {
        id: 'activity',
        description: item.subtitle || undefined,
        action: { label: m["common.open"](), onClick: () => navigate(parseSearchRoute(item.route) as never) },
      })
    } else {
      t.info(m["common.updates_many"]({ count: loud.length }), { id: 'activity' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  return null
}
