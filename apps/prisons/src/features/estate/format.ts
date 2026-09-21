import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'

/** How long ago, in words. Every figure on the estate says how old it is,
 * because Head Office only ever knows a facility as it was when last heard from. */
export function ago(ms: number | null) {
  return ms === null ? null : formatDistanceToNowStrict(ms, { addSuffix: true })
}

export function monthOf(from: number) {
  return format(from, 'MMMM yyyy')
}
