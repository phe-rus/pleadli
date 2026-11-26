import * as m from '@/paraglide/messages'
import type { Next } from './schema'

/** What the file needs next, in the words the office uses. */
export const actionLabel = (n: Pick<Next, 'action'>) =>
  (({ allocate: m['attn.allocate'], read: m['attn.read'], decide: m['attn.decide'], prepare: m['attn.prepare'], send: m['attn.send'], await_police: m['attn.await_police'], follow_court: m['attn.follow_court'], closed: m['attn.closed'] })[n.action])()

/** Who the file is waiting on. */
export const holderLabel = (n: Pick<Next, 'holder' | 'holderName'>) => {
  if (n.holder === 'officer') return n.holderName ? m['attn.with_name']({ name: n.holderName }) : m['attn.holder_unnamed']()
  return ({ office: m['attn.holder_office'], police: m['attn.holder_police'], director: m['attn.holder_director'], nobody: m['attn.holder_nobody'] })[n.holder]()
}

/** The short name of the step a file is waiting at, for a list's Stage column. */
export const stepWord = (n: Pick<Next, 'action'>) =>
  (({ allocate: m['attn.step_allocate'], read: m['attn.step_read'], decide: m['attn.step_decide'], prepare: m['attn.step_send'], send: m['attn.step_send'], await_police: m['attn.step_police'], follow_court: m['attn.step_court'], closed: m['attn.step_closed'] })[n.action])()

/** The order files come in on the signed-in person's list: decisions first, then
 * sending, then reading, then giving out. */
export const actionRank: Record<Next['action'], number> = { decide: 0, send: 1, prepare: 1, read: 2, allocate: 3, follow_court: 4, await_police: 5, closed: 6 }

/** The button on a line: the one thing to do, in a word. */
export const verbLabel = (n: Pick<Next, 'action'>) =>
  (({ allocate: m['attn.verb_allocate'], read: m['attn.verb_read'], decide: m['attn.verb_decide'], prepare: m['attn.verb_prepare'], send: m['attn.verb_send'], await_police: m['today.open'], follow_court: m['today.open'], closed: m['today.open'] })[n.action])()
