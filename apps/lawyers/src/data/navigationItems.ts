import type { Usage } from '@/features/usages'
import * as m from '@/paraglide/messages'
import {
  AiMagicIcon,
  Clock01Icon,
  Folder01Icon,
  ChartHistogramIcon,
  Stamp01Icon,
  KanbanIcon,
  Calendar03Icon,
  ChartBarLineIcon,
  DashboardBrowsingIcon,
  Invoice01Icon,
  LegalDocument01Icon,
  Settings01Icon,
  Task01Icon,
  UserGroupIcon,
  UserAdd01Icon,
} from '@hugeicons/core-free-icons'

export type NavIcon = typeof DashboardBrowsingIcon

/** Which count from the Today read model an item carries beside its name. */
export type NavCount = 'notClosed' | 'noHearing' | 'tasksOverdue' | 'draftDocuments'

export type NavItem = {
  /** Display only (a getter, read in the current language). */
  readonly label: string
  icon: NavIcon
  to: string
  /** A slice of a shared page, held in the URL as a search parameter. */
  search?: Record<string, string>
  exact?: boolean
  /** A second address that is the same place (Calendar's month beside its day). */
  also?: string
  count?: NavCount
  /** Sidebar group. Without one, the place is reachable but not listed. */
  section?: NavSection
  /** Shown only while the practice has this kind of work switched on. */
  usage?: Usage
}

/** Where an item sits in the sidebar: the day's work at the top, the matters
 * in folders, then the office. An item without a section is still a place
 * (search, links, its tab) but is not listed. */
export type NavSection = 'main' | 'matters' | 'office'

/**
 * The sidebar, organised the way the work is: what is on today, then the
 * matters in folders by where they stand (the board is a way of looking at
 * open matters, not a place of its own), then the office. Each thing has one
 * place; Assist sits in the title bar, Settings at the foot of the sidebar.
 */
export const lawyersNav: readonly NavItem[] = [
  { get label() { return m["nav.today"]() }, icon: DashboardBrowsingIcon, to: '/', exact: true, section: 'main' },
  { get label() { return m["nav.recent"]() }, icon: Clock01Icon, to: '/recent', section: 'main' },
  // Day (the diary) and Month are one place, Calendar, as in Apple Calendar.
  { get label() { return m["nav.calendar"]() }, icon: Calendar03Icon, to: '/diary', also: '/calendar', count: 'notClosed', section: 'main' },
  { get label() { return m["nav.tasks"]() }, icon: Task01Icon, to: '/tasks', count: 'tasksOverdue', section: 'main' },
  { get label() { return m["nav.documents"]() }, icon: LegalDocument01Icon, to: '/documents', count: 'draftDocuments', section: 'main' },

  { get label() { return m["nav.open_matters"]() }, icon: Folder01Icon, to: '/matters', search: { view: 'open' }, section: 'matters' },
  { get label() { return m["nav.no_hearing"]() }, icon: Folder01Icon, to: '/matters', search: { view: 'no_hearing' }, count: 'noHearing', section: 'matters' },
  { get label() { return m["nav.criminal"]() }, icon: Folder01Icon, to: '/criminal', section: 'matters', usage: 'criminal' },
  { get label() { return m["nav.closed"]() }, icon: Folder01Icon, to: '/matters', search: { view: 'closed' }, section: 'matters' },
  { get label() { return m["nav.all_matters"]() }, icon: Folder01Icon, to: '/matters', search: { view: 'all' }, section: 'matters' },

  { get label() { return m["nav.clients"]() }, icon: UserGroupIcon, to: '/clients', section: 'office' },
  { get label() { return m["nav.services"]() }, icon: UserAdd01Icon, to: '/services', section: 'office' },
  { get label() { return m["nav.registers"]() }, icon: Stamp01Icon, to: '/registers', section: 'office', usage: 'oaths' },
  { get label() { return m["nav.money"]() }, icon: Invoice01Icon, to: '/money', section: 'office' },
  { get label() { return m["nav.time"]() }, icon: ChartBarLineIcon, to: '/time', section: 'office' },
  { get label() { return m["nav.statistics"]() }, icon: ChartHistogramIcon, to: '/statistics', section: 'office' },

  { get label() { return m["nav.calendar"]() }, icon: Calendar03Icon, to: '/calendar' },
  { get label() { return m["nav.board"]() }, icon: KanbanIcon, to: '/matters', search: { view: 'board' } },
  { get label() { return m["nav.assist"]() }, icon: AiMagicIcon, to: '/assist' },
  { get label() { return m["nav.settings"]() }, icon: Settings01Icon, to: '/settings' },
]

/** The nav entry a location belongs to, for tab titles and icons. `/matters` has
 * several entries: the search parameter picks one. */
export function areaMeta(pathname: string, search: Record<string, unknown> = {}): NavItem | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  const matches = lawyersNav.filter((item) => item.to === (path.startsWith('/settings/') ? '/settings' : path))
  return matches.find((item) => item.search && Object.entries(item.search).every(([k, v]) => search[k] === v)) ?? matches[0]
}

/** Whether an item is the one in view. */
export function isNavActive(item: NavItem, pathname: string, search: Record<string, unknown>) {
  if (item.exact) return pathname === item.to
  if (item.also && (pathname === item.also || pathname.startsWith(`${item.also}/`))) return true
  if (!(pathname === item.to || pathname.startsWith(`${item.to}/`))) return false
  if (!item.search) return true
  return Object.entries(item.search).every(([k, v]) => { const got = search[k] ?? 'open'; return got === v || (v === 'open' && got === 'board') })
}
