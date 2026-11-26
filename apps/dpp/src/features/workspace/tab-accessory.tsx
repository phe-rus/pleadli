import { useAttention } from '@/features/attention'
import * as m from '@/paraglide/messages'
import { cn } from '@pleadli/ui/lib/utils'

/** After an open file's title: a dot when that file needs the person signed in.
 * Amber for something to do, red when a time limit has run out. Nothing for a
 * file that is only waiting, so the strip stays quiet until something is owed. */
export function TabAccessory({ tab }: { tab: { key: string; kind: string } }) {
  const { forFile } = useAttention()
  if (tab.kind !== 'file') return null
  const n = forFile(tab.key.replace(/^file:/, ''))
  if (!n?.needsMe) return null
  return <span role="img" aria-label={n.overdue ? m['attn.tab_overdue']() : m['attn.tab_needs_you']()} className={cn('size-1.5 shrink-0 rounded-full', n.overdue ? 'bg-destructive' : 'bg-amber-500')} />
}
