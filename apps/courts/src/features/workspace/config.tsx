import { CommandMenu } from '@/components/command-menu'
import { courtsNav, isNavActive, navSections, type NavItem } from '@/data/navigationItems'
import { BrandLogo } from '@/features/brand'
import { overviewOptions } from '@/features/overview'
import { useProfile } from '@/features/profile'
import { FolderViewIcon } from '@hugeicons/core-free-icons'
import type { NavModel, NavRow, QuickAddItem, ShellConfig, ShellLabels } from '@pleadli/shell'
import { useQuery } from '@tanstack/react-query'
import { CreateFrame, QuickCaseForm } from './quick-add'
import { useRecordTitle } from './record-title'
import { HeaderEnd, LicenceBar } from './slots'
import { resolveIdentity, tabIcon } from './tab-identity'

/** Courts has no translation catalog yet (feature 14 audit), so its words are
 * English here, in one place. Feature 15 or 27 moves them into messages. */
const useLabels = (): ShellLabels => ({
  sidebar: 'Sidebar',
  places: 'Places',
  search: 'Search',
  quickAdd: 'Quick actions',
  find: 'Find',
  start: 'Start',
  settings: 'Settings',
  signOut: 'Sign out',
  loading: 'Loading',
  openTabs: 'Open tabs',
  window: 'Window',
  previousTab: 'Previous tab',
  nextTab: 'Next tab',
  previousTabWith: (key) => `Previous tab (${key})`,
  nextTabWith: (key) => `Next tab (${key})`,
  pin: 'Pin',
  unpin: 'Unpin',
  pinTab: (title) => `Pin ${title}`,
  unpinTab: (title) => `Unpin ${title}`,
  closeTab: (title) => `Close ${title}`,
  closeWith: (key) => `Close (${key})`,
  hideSidebar: 'Hide sidebar',
  showSidebar: 'Show sidebar',
  controls: { group: 'Window controls', close: 'Close', minimize: 'Minimize', maximize: 'Maximize' },
  rightPanel: {
    title: 'Side panel',
    empty: 'Nothing here yet.',
    open: 'Show side panel',
    close: 'Hide side panel',
    lock: 'Keep side panel open',
    unlock: 'Let side panel close',
    resize: 'Resize side panel',
    widen: 'Make side panel wider',
    narrow: 'Make side panel narrower',
  },
  error: { title: 'This page did not load', body: 'Something went wrong while opening it. Your work is safe. Try again.', retry: 'Try again' },
  recordTabs: {
    overview: { label: 'Overview', empty: 'The summary of this case will appear here.', action: 'Add details' },
    papers: { label: 'Documents', empty: 'Documents attached to this case go here.', action: 'Add a document' },
    people: { label: 'People', empty: 'The people linked to this case go here.', action: 'Add a person' },
    history: { label: 'History', empty: 'What was done to this case, and when, goes here.', action: 'See activity' },
  },
})

const idOf = (item: NavItem) => `${item.to}${item.search ? `?${new URLSearchParams(item.search)}` : ''}`
const rowOf = (item: NavItem): NavRow => ({ id: idOf(item), to: idOf(item), label: item.label, icon: item.icon, match: ({ pathname, search }) => isNavActive(item, pathname, search) })

/** The sidebar as data: Today, then the bench, the register, reference and the office. */
const useNav = (): NavModel => ({
  today: rowOf(courtsNav.find((item) => !item.section)!),
  sections: navSections.map((section) => ({ id: section.id, label: section.label, rows: courtsNav.filter((item) => item.section === section.id).map(rowOf) })),
})

/** Counts are read from the record, and a chip shows only when there is work behind it. */
const useCounts = () => {
  const { data: today } = useQuery(overviewOptions())
  const out: Record<string, { value: number; urgent?: boolean }> = {}
  if (!today) return out
  for (const item of courtsNav) if (item.count) out[idOf(item)] = { value: today.counts[item.count], urgent: item.count === 'notClosed' }
  return out
}

const useQuickAdd = (): QuickAddItem[] => [
  { id: 'case', label: 'Register a case', icon: FolderViewIcon, panel: { title: 'Register a case', description: 'Record a criminal case the court registry has numbered.', render: (context) => <QuickCaseForm {...context} /> } },
]

const useBrand = () => {
  const { data: profile } = useProfile()
  return { product: 'Pleadli Courts', office: profile?.courtName?.trim() || 'Bench workspace', crest: <BrandLogo className="size-8 shrink-0" /> }
}

/** Who is sitting here: the installation's one judicial officer, or a prompt to say who. No sign in. */
const useFooter = () => {
  const { data: profile } = useProfile()
  return {
    person: profile
      ? { name: profile.name, sub: profile.title ?? 'Judicial officer', initials: profile.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), to: '/settings' }
      : { name: 'No judicial officer set', sub: 'Add your name and court so orders carry them', initials: '?', to: '/settings' },
    languageSelect: null,
    settingsTo: '/settings',
  }
}

/** Courts' description of itself to the shell. */
export const shellConfig: ShellConfig = {
  labels: useLabels,
  brand: useBrand,
  nav: useNav,
  counts: useCounts,
  home: { key: 'overview', kind: 'overview', to: '/', title: () => 'Today' },
  identity: { resolve: resolveIdentity, icon: tabIcon, useRecordTitle },
  search: () => ({ enabled: true, menu: CommandMenu }),
  quickAdd: useQuickAdd,
  createFrame: CreateFrame,
  footer: useFooter,
  slots: { licenceBar: LicenceBar, headerEnd: HeaderEnd },
}
