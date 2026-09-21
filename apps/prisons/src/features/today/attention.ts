import { isOpen, type InboxItem } from '@/features/notifications'
import { bucketOf, dueText, type Obligation } from '@/features/obligations'
import type { ReturnStage } from '@/features/reports'
import { m } from '@/paraglide/messages'

/** Where a group of obligations is worked as a whole, when it has such a place. */
export type Area = { to: '/legal' | '/movements'; label: string }

type KindDef = {
  title: () => string
  area?: () => Area
  /** Something whose lateness is a matter of lawful custody, so an overdue
   * one is marked urgent. Both come from the statutes the obligation cites:
   * discharge on entitlement (s.83) and the mandatory-bail threshold. */
  urgentWhenOverdue?: boolean
}

const legal = (label: () => string) => () => ({ to: '/legal' as const, label: label() })
const movements = () => ({ to: '/movements' as const, label: m.obligations_open_movements() })

/** The obligation kinds the node derives, in the order attention lists them.
 * A kind the node adds and this table lacks is not dropped: it is listed under
 * its own title, last. */
const kinds: readonly (readonly [string, KindDef])[] = [
  ['discharge_due', { title: () => m.attention_discharge_due(), urgentWhenOverdue: true }],
  ['mandatory_bail', { title: () => m.attention_remand_threshold(), area: legal(() => m.attention_review()), urgentWhenOverdue: true }],
  ['court_date', { title: () => m.attention_court(), area: legal(() => m.attention_review_court_diary()) }],
  ['transfer_confirmation', { title: () => m.attention_transfer_not_confirmed(), area: movements }],
  ['transfer_arrival', { title: () => m.attention_arrival_to_confirm(), area: movements }],
  ['instrument_pending', { title: () => m.attention_documents_pending() }],
  ['sentence_missing', { title: () => m.attention_sentence_not_recorded() }],
  ['regularise', { title: () => m.attention_regularise() }],
  ['hospital_return', { title: () => m.attention_at_hospital() }],
  ['parole_window', { title: () => m.attention_parole_window(), area: legal(() => m.attention_review()) }],
  ['review_due', { title: () => m.attention_review_bundle(), area: legal(() => m.attention_review()) }],
]

const kindIndex = new Map(kinds.map(([kind], index) => [kind, index]))
const kindDef = new Map(kinds)

/** One group of the same kind of obligation, listed once with the people in it. */
export type ObligationEntry = {
  type: 'obligations'
  key: string
  title: string
  urgent: boolean
  summary: string
  items: Obligation[]
  area: Area | null
}

export type SystemAction = { label: string; /** A path, opened with the router. */ to?: string; run?: () => void }

/** Attention that is not a person's obligation: something about the facility
 * itself, or a message that still needs an officer. */
export type SystemEntry = { type: 'system'; key: string; title: string; summary: string; action: SystemAction | null }

export type AttentionEntry = ObligationEntry | SystemEntry

const byDue = (a: Obligation, b: Obligation) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)

function namesOf(items: readonly Obligation[]) {
  const names = [...new Set(items.map((o) => o.prisonerName).filter((name): name is string => !!name))]
  const rest = names.length - 2
  return rest > 0 ? `${names.slice(0, 2).join(', ')} ${m.attention_and_more({ count: rest })}` : names.join(', ')
}

function entryOf(kind: string, items: Obligation[], now: number): ObligationEntry {
  const def = kindDef.get(kind)
  const sorted = [...items].sort(byDue)
  const first = sorted[0]
  // A pending document is chased on a date the facility sets, so "in five
  // days" says nothing useful: the date shows only once it has come.
  const showDue = first.group !== 'exception' || bucketOf(first, now) !== 'soon'
  return {
    type: 'obligations',
    key: kind,
    title: def?.title() ?? first.title,
    urgent: !!def?.urgentWhenOverdue && sorted.some((o) => bucketOf(o, now) === 'overdue'),
    summary: [namesOf(sorted), showDue ? dueText(first, now) : ''].filter(Boolean).join(' · '),
    items: sorted,
    area: def?.area?.() ?? null,
  }
}

function groupByKind(obligations: readonly Obligation[], now: number): ObligationEntry[] {
  const byKind = new Map<string, Obligation[]>()
  for (const o of obligations) byKind.set(o.kind, [...(byKind.get(o.kind) ?? []), o])
  return [...byKind.entries()]
    .map(([kind, items]) => entryOf(kind, items, now))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || (kindIndex.get(a.key) ?? kinds.length) - (kindIndex.get(b.key) ?? kinds.length))
}

/** An obligation needs action now when it is an exception the node has
 * flagged, or is overdue, due today, or has no date. One due on a later day is
 * listed as coming up instead. */
const needsAction = (o: Obligation, now: number) => o.group === 'exception' || bucketOf(o, now) !== 'soon'

/** The node's obligations as attention: what needs action now, and what is
 * coming up, each grouped by kind. */
export function obligationEntries(obligations: readonly Obligation[], now: number) {
  return {
    needs: groupByKind(obligations.filter((o) => needsAction(o, now)), now),
    later: groupByKind(obligations.filter((o) => !needsAction(o, now)), now),
  }
}

export type SystemInput = {
  visitsAwaitingDecision: number
  facilityNamed: boolean
  onSetupProfile: () => void
  /** `null` when this officer may not read reports, so the return is not theirs to be told about. */
  monthlyReturn: { stage: ReturnStage; month: string; reportId: string | null } | null
  inbox: readonly InboxItem[] | undefined
}

/** Attention from things other than a person's file. Only what the node
 * really knows: a return not yet produced, attested or sent; visit requests
 * with no decision; a facility with no name; and the inbox items that still
 * need an officer. An inbox item that only restates an obligation is left out,
 * because the obligation is already listed. */
export function systemEntries(input: SystemInput): SystemEntry[] {
  const out: SystemEntry[] = []
  const { monthlyReturn: ret } = input

  if (ret) {
    const open = ret.reportId ? { label: m.attention_open(), to: `/reports/${ret.reportId}` } : { label: m.attention_produce_return(), to: '/reports' }
    const summary = {
      not_produced: m.attention_return_not_produced({ month: ret.month }),
      awaiting_attestation: m.attention_return_unattested({ month: ret.month }),
      ready_to_send: m.attention_return_ready({ month: ret.month }),
      send_failed: m.attention_return_send_failed({ month: ret.month }),
    } as Partial<Record<ReturnStage, string>>
    if (summary[ret.stage]) out.push({ type: 'system', key: 'return', title: m.attention_monthly_return(), summary: summary[ret.stage]!, action: open })
  }

  if (input.visitsAwaitingDecision > 0) {
    out.push({
      type: 'system',
      key: 'visit-requests',
      title: m.attention_visit_requests(),
      summary: m.attention_visits_awaiting({ count: input.visitsAwaitingDecision }),
      action: { label: m.attention_open_visits(), to: '/visits' },
    })
  }

  if (!input.facilityNamed) {
    out.push({
      type: 'system',
      key: 'profile',
      title: m.today_set_the_facility_profile(),
      summary: m.today_the_name_goes_on_a_transfer(),
      action: { label: m.today_set_up(), run: input.onSetupProfile },
    })
  }

  for (const item of (input.inbox ?? []).filter((i) => isOpen(i) && i.kind !== 'obligation' && i.kind !== 'facility_request')) {
    out.push({
      type: 'system',
      key: `inbox:${item.id}`,
      title: item.subject,
      summary: item.body ?? item.source,
      action: item.relatedRoute ? { label: m.attention_open(), to: item.relatedRoute } : null,
    })
  }
  return out
}
