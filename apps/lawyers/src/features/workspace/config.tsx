import * as m from '@/paraglide/messages'
import { CommandMenu } from '@/components/command-menu'
import { isNavActive, lawyersNav, type NavItem } from '@/data/navigationItems'
import { BrandLogo } from '@/features/brand'
import { ClientForm } from '@/features/clients'
import { StatusBarLanguageSelect } from '@/features/i18n'
import { signOut, useBrand, useSessionStatus, useUsagesEnabled } from '@/features/installation'
import { overviewOptions } from '@/features/overview'
import { useProfile } from '@/features/profile'
import { FolderViewIcon, UserGroupIcon } from '@hugeicons/core-free-icons'
import type { NavModel, NavRow, QuickAddItem, ShellConfig, ShellLabels } from '@pleadli/shell'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CreateFrame, QuickMatterForm } from './quick-add'
import { useRecordTitle } from './record-title'
import { AssistHeader, AssistSidePanel, LicenceBar } from './slots'
import { resolveIdentity, tabIcon, tabLabel } from './tab-identity'

/** Lawyers' words for the shell, from Lawyers' own translations. */
const useLabels = (): ShellLabels => ({
  sidebar: m["workspace.sidebar"](),
  places: m["workspace.places"](),
  search: m["workspace.search_short"](),
  quickAdd: m["workspace.quick.label"](),
  find: m["workspace.quick.find"](),
  start: m["workspace.quick.start"](),
  settings: m["nav.settings"](),
  signOut: m["session.sign_out"](),
  loading: m["shell.loading"](),
  openTabs: m["shell.tabs.open_tabs"](),
  window: m["workspace.window"](),
  previousTab: m["workspace.tab.previous"](),
  nextTab: m["workspace.tab.next"](),
  previousTabWith: (key) => m["shell.tabs.previous_with"]({ key }),
  nextTabWith: (key) => m["shell.tabs.next_with"]({ key }),
  pin: m["shell.tabs.pin"](),
  unpin: m["shell.tabs.unpin"](),
  pinTab: (title) => m["shell.tabs.pin_named"]({ title }),
  unpinTab: (title) => m["shell.tabs.unpin_named"]({ title }),
  closeTab: (title) => m["shell.tabs.close_named"]({ title }),
  closeWith: (key) => m["shell.tabs.close_with"]({ key }),
  hideSidebar: m["workspace.hide_sidebar"](),
  showSidebar: m["workspace.show_sidebar"](),
  controls: { group: m["window.controls"](), close: m["window.close"](), minimize: m["window.minimize"](), maximize: m["window.maximize"]() },
  rightPanel: {
    title: m["shell.right_panel.title"](),
    empty: m["shell.right_panel.empty"](),
    open: m["shell.right_panel.open"](),
    close: m["shell.right_panel.close"](),
    lock: m["shell.right_panel.lock"](),
    unlock: m["shell.right_panel.unlock"](),
    resize: m["shell.right_panel.resize"](),
    widen: m["shell.right_panel.widen"](),
    narrow: m["shell.right_panel.narrow"](),
  },
  error: { title: m["shell.error.title"](), body: m["shell.error.body"](), retry: m["shell.error.retry"]() },
  recordTabs: {
    overview: { label: m["shell.record_tabs.overview_label"](), empty: m["shell.record_tabs.overview_empty"](), action: m["shell.record_tabs.overview_action"]() },
    papers: { label: m["shell.record_tabs.papers_label"](), empty: m["shell.record_tabs.papers_empty"](), action: m["shell.record_tabs.papers_action"]() },
    people: { label: m["shell.record_tabs.people_label"](), empty: m["shell.record_tabs.people_empty"](), action: m["shell.record_tabs.people_action"]() },
    history: { label: m["shell.record_tabs.history_label"](), empty: m["shell.record_tabs.history_empty"](), action: m["shell.record_tabs.history_action"]() },
  },
})

const idOf = (item: NavItem) => `${item.to}${item.search ? `?${new URLSearchParams(item.search)}` : ''}`
const rowOf = (item: NavItem): NavRow => ({ id: idOf(item), to: idOf(item), label: item.label, icon: item.icon, match: ({ pathname, search }) => isNavActive(item, pathname, search) })

/** The sidebar as data: the day at the top (no heading), then the matters in folders, then the office. */
const useNav = (): NavModel => {
  const { data: usages } = useUsagesEnabled()
  const inSection = (id: string) => lawyersNav.filter((item) => item.section === id && (!item.usage || usages?.includes(item.usage))).map(rowOf)
  return {
    today: rowOf(lawyersNav.find((item) => item.to === '/' && item.section === 'main')!),
    sections: [
      { id: 'main', rows: inSection('main').filter((row) => row.to !== '/') },
      { id: 'matters', label: m["nav.section.matters"](), rows: inSection('matters') },
      { id: 'office', label: m["nav.section.office"](), rows: inSection('office') },
    ],
  }
}

/** Hearings left unclosed and overdue tasks are late; the rest is only how many. */
const useCounts = () => {
  const { data: today } = useQuery(overviewOptions())
  const out: Record<string, { value: number; urgent?: boolean }> = {}
  if (!today) return out
  for (const item of lawyersNav) if (item.count) out[idOf(item)] = { value: today.counts[item.count], urgent: item.count === 'notClosed' || item.count === 'tasksOverdue' }
  return out
}

const useQuickAdd = (): QuickAddItem[] => [
  { id: 'matter', label: m["matter.open_a_matter"](), icon: FolderViewIcon, panel: { title: m["matter.open_a_matter"](), description: m["matter.open_a_matter_about"](), render: (context) => <QuickMatterForm {...context} /> } },
  { id: 'client', label: m["workspace.quick.add_client"](), icon: UserGroupIcon, panel: { title: m["workspace.quick.add_client"](), description: m["workspace.quick.add_client_about"](), render: ({ onDirtyChange, close }) => <ClientForm onDirtyChange={onDirtyChange} onSuccess={close} /> } },
]

const useBrandModel = () => {
  const { data: brand } = useBrand()
  return { product: 'Pleadli Lawyers', office: brand?.officeName ?? m["workspace.subtitle_default"](), crest: <BrandLogo className="size-8 shrink-0" /> }
}

/** Who practises here, with the few things that belong to the person rather than to the work. */
const useFooter = () => {
  const { data: profile } = useProfile()
  const { data: session } = useSessionStatus()
  const queryClient = useQueryClient()
  const name = profile?.name ?? session?.actor?.name
  return {
    person: {
      name: name ?? m["workspace.no_advocate"](),
      sub: profile?.firm ?? session?.actor?.title ?? m["workspace.advocate"](),
      initials: (name ?? '').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '·',
      to: '/settings/you',
    },
    languageSelect: <StatusBarLanguageSelect />,
    settingsTo: '/settings',
    onSignOut: session?.actor && session.level && session.level !== 'none' ? () => void signOut().then(() => queryClient.invalidateQueries({ queryKey: ['session'] })) : undefined,
  }
}

/** Lawyers' description of itself to the shell. */
export const shellConfig: ShellConfig = {
  labels: useLabels,
  brand: useBrandModel,
  nav: useNav,
  counts: useCounts,
  // The Recent page lists what was opened lately, so Lawyers keeps more than the shell's three.
  maxRecents: 20,
  home: { key: 'overview', kind: 'overview', to: '/', title: () => m["nav.today"]() },
  identity: { resolve: resolveIdentity, icon: tabIcon, label: tabLabel, useRecordTitle },
  search: () => ({ enabled: true, menu: CommandMenu }),
  quickAdd: useQuickAdd,
  createFrame: CreateFrame,
  footer: useFooter,
  slots: { licenceBar: LicenceBar, rightPanelHeader: AssistHeader, rightPanel: AssistSidePanel },
}
