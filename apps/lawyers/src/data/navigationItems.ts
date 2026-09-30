import type { Usage } from '@/features/usages'
import * as m from '@/paraglide/messages'
import {
  AiMagicIcon,
  Analytics01Icon,
  ChartHistogramIcon,
  Stamp01Icon,
  KanbanIcon,
  Calendar03Icon,
  CalendarCheckOut01Icon,
  ChartBarLineIcon,
  DashboardBrowsingIcon,
  FolderViewIcon,
  Invoice01Icon,
  Files01Icon,
  LegalDocument01Icon,
  Settings01Icon,
  Task01Icon,
  UserGroupIcon,
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
  count?: NavCount
  /** Sidebar group. Today has none: it is on the ribbon. */
  section?: NavSection
  /** Shown only while the practice has this kind of work switched on. */
  usage?: Usage
}

export type NavSection = 'practice' | 'matters' | 'office'

export const navSections: readonly { id: NavSection; readonly label: string }[] = [
  { id: 'practice', get label() { return m["nav.section.practice"]() } },
  { id: 'matters', get label() { return m["nav.section.matters"]() } },
  { id: 'office', get label() { return m["nav.section.office"]() } },
]

/** The information architecture. It lists only what is built. Filings to the
 * court, hearing notices and orders from it, and the connection to Courts and DPP
 * are not here until they exist. */
export const lawyersNav: readonly NavItem[] = [
  { get label() { return m["nav.today"]() }, icon: DashboardBrowsingIcon, to: '/', exact: true },

  { get label() { return m["nav.calendar"]() }, icon: Calendar03Icon, to: '/calendar', section: 'practice' },
  { get label() { return m["nav.diary"]() }, icon: CalendarCheckOut01Icon, to: '/diary', count: 'notClosed', section: 'practice' },
  { get label() { return m["nav.tasks"]() }, icon: Task01Icon, to: '/tasks', count: 'tasksOverdue', section: 'practice' },
  { get label() { return m["nav.documents"]() }, icon: LegalDocument01Icon, to: '/documents', count: 'draftDocuments', section: 'practice' },
  { get label() { return m["nav.assist"]() }, icon: AiMagicIcon, to: '/assist', section: 'practice' },
  { get label() { return m["nav.registers"]() }, icon: Stamp01Icon, to: '/registers', section: 'practice', usage: 'oaths' },

  { get label() { return m["nav.board"]() }, icon: KanbanIcon, to: '/matters', search: { view: 'board' }, section: 'matters' },
  { get label() { return m["nav.open_matters"]() }, icon: FolderViewIcon, to: '/matters', search: { view: 'open' }, section: 'matters' },
  { get label() { return m["nav.no_hearing"]() }, icon: Analytics01Icon, to: '/matters', search: { view: 'no_hearing' }, count: 'noHearing', section: 'matters' },
  { get label() { return m["nav.closed"]() }, icon: Files01Icon, to: '/matters', search: { view: 'closed' }, section: 'matters' },
  { get label() { return m["nav.all_matters"]() }, icon: Files01Icon, to: '/matters', search: { view: 'all' }, section: 'matters' },

  { get label() { return m["nav.clients"]() }, icon: UserGroupIcon, to: '/clients', section: 'office' },
  { get label() { return m["nav.money"]() }, icon: Invoice01Icon, to: '/money', section: 'office' },
  { get label() { return m["nav.time"]() }, icon: ChartBarLineIcon, to: '/time', section: 'office' },
  { get label() { return m["nav.statistics"]() }, icon: ChartHistogramIcon, to: '/statistics', section: 'office' },
  { get label() { return m["nav.settings"]() }, icon: Settings01Icon, to: '/settings', section: 'office' },
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
  if (!(pathname === item.to || pathname.startsWith(`${item.to}/`))) return false
  if (!item.search) return true
  return Object.entries(item.search).every(([k, v]) => (search[k] ?? 'board') === v)
}
