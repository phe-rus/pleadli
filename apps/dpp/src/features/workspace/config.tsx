import * as m from '@/paraglide/messages'
import { CommandMenu } from '@/components/command-menu'
import { dppNav, isNavActive, type NavItem } from '@/data/navigationItems'
import { BrandLogo } from '@/features/brand'
import { StatusBarLanguageSelect } from '@/features/i18n'
import { useBrand } from '@/features/installation'
import { PersonForm } from '@/features/people'
import { boardOptions } from '@/features/pipeline'
import { fileFolders, fileViews } from '@/features/prosecution-files/schema'
import { lockNow, useSecurityStatus } from '@/features/security'
import { workloadOptions } from '@/features/workload'
import { serviceNames, productName } from '@/lib/jurisdiction'
import { Folder01Icon, FolderViewIcon, UserGroupIcon } from '@hugeicons/core-free-icons'
import type { NavModel, NavRow, QuickAddItem, ShellConfig, ShellLabels } from '@pleadli/shell'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CreateFrame, QuickFileForm } from './quick-add'
import { useRecordTitle } from './record-title'
import { AssistHeader, AssistSidePanel, HeaderEnd, LicenceBar, StatusBar } from './slots'
import { resolveIdentity, tabIcon, tabTitle } from './tab-identity'

/** DPP words for the shell, from DPP's own translations. */
const useLabels = (): ShellLabels => ({
  sidebar: m["workspace.sidebar"](),
  places: m["workspace.places"](),
  search: m["workspace.search_short"](),
  quickAdd: m["workspace.quick.label"](),
  find: m["workspace.quick.find"](),
  start: m["workspace.quick.start"](),
  settings: m["nav.item.settings"](),
  signOut: m["workspace.sign_out"](),
  loading: m["shell.loading"](),
  openTabs: m["workspace.tab.open_tabs"](),
  window: m["workspace.window"](),
  previousTab: m["workspace.tab.previous"](),
  nextTab: m["workspace.tab.next"](),
  previousTabWith: () => m["workspace.tab.previous_shortcut"](),
  nextTabWith: () => m["workspace.tab.next_shortcut"](),
  pin: m["workspace.tab.pin"](),
  unpin: m["workspace.tab.unpin"](),
  pinTab: (title) => m["workspace.tab.pin_named"]({ title }),
  unpinTab: (title) => m["workspace.tab.unpin_named"]({ title }),
  closeTab: (title) => m["workspace.tab.close_named"]({ title }),
  closeWith: () => m["workspace.tab.close_shortcut"](),
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
const rowOf = (item: NavItem): NavRow => ({ id: idOf(item), to: idOf(item), label: item.label(), icon: item.icon, match: ({ pathname, search }) => isNavActive(item, pathname, search) })

/** The sidebar as data: what is on today at the top (no heading), then Files
 * (the inbox, and the files in folders by stage), then the office. */
const useNav = (): NavModel => {
  const inSection = (id: string) => dppNav.filter((item) => item.section === id).map(rowOf)
  const today = dppNav.find((item) => item.to === '/')!
  return {
    today: rowOf(today),
    sections: [
      { id: 'main', rows: inSection('main').filter((row) => row.to !== '/') },
      {
        id: 'files',
        label: m["workspace.section.files"](),
        rows: [
          ...inSection('inbox'),
          ...fileFolders.map((id): NavRow => {
            const view = fileViews.find((v) => v.id === id)!
            return { id: `folder:${id}`, to: `/files?view=${id}`, label: view.label, icon: Folder01Icon, match: ({ pathname, search }) => pathname === '/files' && (search.view ?? 'all') === id }
          }),
        ],
      },
      { id: 'office', label: m["workspace.section.office"](), rows: inSection('office') },
    ],
  }
}

/** Open work is counted; the whole register and what is closed are not, as a
 * Mac counts unread mail and not the archive. */
const useCounts = () => {
  const { data: workload } = useQuery(workloadOptions())
  const { data: board = [] } = useQuery(boardOptions())
  const out: Record<string, { value: number }> = {}
  if (!workload) return out
  for (const item of dppNav) {
    if (item.count) out[idOf(item)] = { value: item.count === 'thresholdDue' ? workload.thresholdReviews.length : workload[item.count] }
  }
  for (const id of fileFolders) {
    if (id === 'all' || id === 'concluded') continue
    out[`folder:${id}`] = { value: id === 'returned' ? workload.returned : board.filter((card) => card.stage === id).length }
  }
  return out
}

const useQuickAdd = (): QuickAddItem[] => [
  { id: 'file', label: m["workspace.quick.open_file"](), icon: FolderViewIcon, panel: { title: m["workspace.quick.open_file"](), description: m["workspace.quick.open_file_description"](), render: (context) => <QuickFileForm {...context} /> } },
  { id: 'person', label: m["workspace.quick.add_person"](), icon: UserGroupIcon, panel: { title: m["workspace.quick.add_person"](), description: m["workspace.quick.add_person_description"](), render: ({ onDirtyChange, close }) => <PersonForm onDirtyChange={onDirtyChange} onSuccess={close} /> } },
]

const useBrandModel = () => {
  const { data: brand } = useBrand()
  return { product: productName(), office: brand?.officeName ?? m["workspace.tagline"](), crest: <BrandLogo className="size-8 shrink-0" /> }
}

/** Who is working here, with the few things that belong to the person rather than to the work. */
const useFooter = () => {
  const { data: status } = useSecurityStatus()
  const queryClient = useQueryClient()
  const actor = status?.actor
  const role = actor ? { administrator: m["staff.role.administrator"], prosecutor: m["staff.role.prosecutor"], clerk: m["staff.role.clerk"] }[actor.role] : null
  return {
    person: actor
      ? {
          name: actor.name,
          sub: actor.isDpp ? m["workspace.profile.dpp"]({ head: serviceNames().head }) : (actor.rank ?? role?.() ?? ''),
          initials: actor.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
          to: '/settings/you',
        }
      : undefined,
    languageSelect: <StatusBarLanguageSelect />,
    settingsTo: '/settings',
    onSignOut: status?.configured ? () => void lockNow().then(() => queryClient.invalidateQueries({ queryKey: ['security'] })) : undefined,
  }
}

/** DPP's description of itself to the shell. */
export const shellConfig: ShellConfig = {
  labels: useLabels,
  brand: useBrandModel,
  nav: useNav,
  counts: useCounts,
  // The Recent page lists what was opened lately, so DPP keeps more than the shell's three.
  maxRecents: 24,
  home: { key: 'overview', kind: 'overview', to: '/', title: () => m["tabs.overview"]() },
  identity: { resolve: resolveIdentity, icon: tabIcon, label: tabTitle, useRecordTitle },
  search: () => ({ enabled: true, menu: CommandMenu }),
  quickAdd: useQuickAdd,
  createFrame: CreateFrame,
  footer: useFooter,
  slots: { licenceBar: LicenceBar, headerEnd: HeaderEnd, statusBar: StatusBar, rightPanelHeader: AssistHeader, rightPanel: AssistSidePanel },
}
