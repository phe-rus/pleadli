import { parseSearchRoute } from '@/lib/parse-search-route'
import { t } from '@pleadli/ui/goey-toaster'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useRecentActivity } from './queries'
import { isHighSignalActivity, type ActivityItem } from './schema'

/** Mounted once at the app-shell level (headers.tsx, alongside
 * BackupDispatchIndicator) so it's live from any route, not just
 * Overview. Polls the same recent-activity feed Overview's panel shows
 * (features/activity/queries.ts's 15s refetchInterval is the only
 * "live" mechanism here — see the plan's rationale for polling over
 * instrumenting every domain's create_* with an event emit) and toasts
 * whatever's newly appeared since the last tick. Nothing toasts
 * retroactively for data that already existed when this first mounted. */
export function ActivityToasts() {
  const { data } = useRecentActivity()
  const navigate = useNavigate()
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!data) return

    if (seen.current === null) {
      seen.current = new Set(data.map((item) => item.id))
      return
    }

    for (const item of data) {
      if (seen.current.has(item.id)) continue
      seen.current.add(item.id)
      notify(item, () => navigate(parseSearchRoute(item.route) as never))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  return null
}

function notify(item: ActivityItem, onOpen: () => void) {
  const action = { label: 'Open', onClick: onOpen }
  if (isHighSignalActivity(item)) {
    t.info(item.title, { description: item.subtitle || undefined, action })
  } else {
    t.info(item.title, { action })
  }
}
