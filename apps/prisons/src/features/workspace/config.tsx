import { CommandMenu } from '@/components/command-menu'
import { visibleNav } from '@/data/navigationItems'
import { BrandLogo } from '@/features/brand'
import { SidebarLanguageSelect } from '@/features/i18n'
import { useUnreadCount } from '@/features/notifications'
import { OfficerAvatar, officerRoleLabel } from '@/features/officers'
import { prisonerFolders, prisonersOptions } from '@/features/prisoners'
import { facilityProfileOptions } from '@/features/facility'
import { useHqConfig, usePermissions, useSession, useSignOut } from '@/features/session'
import { m } from '@/paraglide/messages'
import { Add01Icon, ArrowDataTransferHorizontalIcon, DashboardBrowsingIcon, DoorOpenIcon, Folder01Icon, Login02Icon, MoreHorizontalIcon, Notification01Icon } from '@hugeicons/core-free-icons'
import type { NavModel, NavRow, QuickAddItem, ShellConfig, ShellLabels } from '@pleadli/shell'
import { useGo, useWorkspace } from '@pleadli/shell'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { setMoreOpen, TOGGLE_ASSISTANT_EVENT } from './panel-state'
import { useRecordTitle } from './record-title'
import { HeaderEnd, LicenceBar, RightPanelContent, RightPanelHeader, StatusBar } from './slots'
import { identityForPath, resolveIdentity, tabIcon, tabLabel } from './tab-identity'

const useLabels = (): ShellLabels => ({
  sidebar: m.shell_sidebar(),
  places: m.shell_sidebar(),
  search: m.shell_search_short(),
  quickAdd: m.shell_new(),
  find: m.workspace_find(),
  start: m.workspace_start(),
  settings: m.shell_settings(),
  signOut: m.shell_sign_out(),
  loading: m.shell_loading(),
  openTabs: m.workspace_open_tabs(),
  window: m.shell_window(),
  previousTab: m.shell_previous_tab(),
  nextTab: m.shell_next_tab(),
  previousTabWith: () => m.shell_previous_tab(),
  nextTabWith: () => m.shell_next_tab(),
  pin: m.workspace_pin(),
  unpin: m.workspace_unpin(),
  pinTab: (title) => m.workspace_pin_2({ title }),
  unpinTab: (title) => m.workspace_unpin_2({ title }),
  closeTab: (title) => m.workspace_close({ title }),
  closeWith: () => m.workspace_close_ctrl_w(),
  hideSidebar: m.shell_hide_sidebar(),
  showSidebar: m.shell_show_sidebar(),
  controls: { group: 'Window controls', close: m.ui_close(), minimize: m.ui_minimize(), maximize: m.ui_maximize() },
  rightPanel: {
    title: m.shell_right_panel(),
    empty: m.shell_right_panel(),
    open: m.shell_show_panel(),
    close: m.shell_close_panel(),
    lock: m.shell_lock_panel(),
    unlock: m.shell_unlock_panel(),
    resize: m.shell_resize_panel(),
    widen: m.shell_widen_panel(),
    narrow: m.shell_narrow_panel(),
  },
  error: { title: m.shell_error_title(), body: m.shell_error_body(), retry: m.shell_error_retry() },
  recordTabs: {
    overview: { label: m.shell_rt_overview_label(), empty: m.shell_rt_overview_empty(), action: m.shell_rt_overview_action() },
    papers: { label: m.shell_rt_papers_label(), empty: m.shell_rt_papers_empty(), action: m.shell_rt_papers_action() },
    people: { label: m.shell_rt_people_label(), empty: m.shell_rt_people_empty(), action: m.shell_rt_people_action() },
    history: { label: m.shell_rt_history_label(), empty: m.shell_rt_history_empty(), action: m.shell_rt_history_action() },
  },
})

/** The name each place goes by in the sidebar, the words a prison uses. */
function sidebarName(to: string, fallback: string, headOffice: boolean) {
  if (to === '/legal') return m.nav_court()
  if (to === '/requests') return m.nav_requests()
  if (to === '/reports') return headOffice ? m.nav_returns_statistics() : m.nav_registers()
  if (headOffice && to === '/facilities') return m.nav_regions_prisons()
  if (headOffice && to === '/officers') return m.nav_staff()
  return fallback
}

/** Where each area sits. A prison works by its people first, so they lead,
 * sorted into folders; then the day's work; then the prison itself. Head
 * Office has no prisoners of its own and keeps its network and its staff. */
const groups = {
  facility: [
    { id: 'work', label: () => m.shell_section_the_day(), paths: ['/legal', '/movements', '/visits', '/requests'] },
    { id: 'prison', label: () => m.shell_section_the_prison(), paths: ['/reports', '/postbox', '/officers'] },
  ],
  hq: [
    { id: 'work', label: () => m.hq_section_service(), paths: ['/facilities'] },
    { id: 'prison', label: () => m.hq_section_headquarters(), paths: ['/reports', '/postbox', '/officers'] },
  ],
}

const isAt = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`)
const canSeePrisonersNow = (isHeadOffice: boolean, session: unknown, can: (permission: string) => boolean) => !isHeadOffice && (!session || can('prisoner.read'))

function useNav(): NavModel {
  const { data: hqConfig } = useHqConfig()
  const isHeadOffice = hqConfig?.isHeadOffice ?? false
  const { can, session } = usePermissions()
  const areas = useMemo(() => {
    const flat = visibleNav(isHeadOffice, session?.permissions).flatMap((item) => [item, ...(item.children ?? [])])
    return new Map(flat.filter((item) => item.to).map((item) => [item.to!, item]))
  }, [isHeadOffice, session?.permissions])

  const sections: NavModel['sections'] = [
    { id: 'main', rows: [{ id: '/inbox', to: '/inbox', label: m.nav_inbox(), icon: Notification01Icon, match: ({ pathname }) => isAt(pathname, '/inbox') }] },
  ]
  if (canSeePrisonersNow(isHeadOffice, session, can)) {
    sections.push({
      id: 'prisoners',
      label: m.shell_section_prisoners(),
      rows: prisonerFolders.map(
        (folder): NavRow => ({
          id: `folder:${folder.id}`,
          to: folder.id === 'held' ? '/prisoners' : `/prisoners?view=${folder.id}`,
          label: folder.label(),
          icon: Folder01Icon,
          match: ({ pathname, search }) => pathname === '/prisoners' && (typeof search.view === 'string' ? search.view : 'held') === folder.id,
        }),
      ),
    })
  }
  for (const group of groups[isHeadOffice ? 'hq' : 'facility']) {
    const rows = group.paths.flatMap((to) => (areas.has(to) ? [areas.get(to)!] : [])).map((item): NavRow => ({ id: item.to!, to: item.to!, label: sidebarName(item.to!, item.label, isHeadOffice), icon: item.icon, match: ({ pathname }) => isAt(pathname, item.to!) }))
    if (rows.length > 0) sections.push({ id: group.id, label: group.label(), rows })
  }
  return { today: { id: '/', to: '/', label: m.shell_today(), icon: DashboardBrowsingIcon, match: ({ pathname }) => pathname === '/' }, sections }
}

function useCounts() {
  const { data: hqConfig } = useHqConfig()
  const { can, session } = usePermissions()
  const enabled = canSeePrisonersNow(hqConfig?.isHeadOffice ?? false, session, can)
  const { data: unread = 0 } = useUnreadCount()
  const { data: prisoners = [] } = useQuery({ ...prisonersOptions(''), enabled })
  const out: Record<string, { value: number; urgent?: boolean }> = { '/inbox': { value: unread } }
  if (enabled) for (const folder of prisonerFolders) out[`folder:${folder.id}`] = { value: folder.counted ? prisoners.filter(folder.match).length : 0, urgent: folder.urgent }
  return out
}

function useSearch() {
  const { can, session } = usePermissions()
  return { enabled: !session || can('prisoner.read') || can('hq.locate'), menu: CommandMenu }
}

/** What an officer most often needs to do next, filtered by what they may do
 * and by what is open: starting a procedure, and, when a prisoner's file is in
 * view, the procedures that concern that person. */
function useQuickAdd(): QuickAddItem[] {
  const { tabs, activeKey } = useWorkspace()
  const { data: hqConfig } = useHqConfig()
  const { can, session } = usePermissions()
  const go = useGo()
  if (hqConfig?.isHeadOffice || (session && !can('prisoner.read'))) return []
  const active = tabs.find((tab) => tab.key === activeKey)
  const person = active?.kind === 'prisoner' ? identityForPath(active.to) : null
  const items: QuickAddItem[] = [
    { id: 'reception', label: m.workspace_receive_someone(), icon: Login02Icon, run: () => go('/procedures/reception') },
    { id: 'receive', label: m.workspace_receive_a_transfer(), icon: ArrowDataTransferHorizontalIcon, run: () => go('/procedures/receive') },
    { id: 'more', label: m.workspace_visit_court_request_more(), icon: MoreHorizontalIcon, run: () => setMoreOpen(true) },
  ]
  if (person?.kind === 'prisoner') {
    items.push(
      { id: 'discharge', label: `${m.workspace_discharge()}: ${active?.title ?? ''}`, icon: DoorOpenIcon, run: () => go(`/procedures/discharge/${person.recordId}`) },
      { id: 'transfer', label: `${m.workspace_transfer_out()}: ${active?.title ?? ''}`, icon: Add01Icon, run: () => go(`/procedures/transfer/${person.recordId}`) },
    )
  }
  return items
}

function useBrand() {
  const { data: hqConfig } = useHqConfig()
  const { data: profile } = useQuery({ ...facilityProfileOptions(), retry: false })
  return { product: m.app_name(), office: (hqConfig?.isHeadOffice ? m.shell_head_office() : profile?.name?.trim()) ?? '', crest: <BrandLogo className="size-8 shrink-0" /> }
}

function useFooter() {
  const { data: session } = useSession()
  const signOut = useSignOut()
  const officer = session?.officer
  return {
    person: officer && { name: officer.name, sub: m.ui_badge({ badgeNumber: officer.badgeNumber, role: officerRoleLabel(officer.role) }), initials: '', avatar: <OfficerAvatar officer={officer} size={28} /> },
    languageSelect: <SidebarLanguageSelect />,
    settingsTo: '/settings',
    onSignOut: session ? () => signOut.mutate() : undefined,
  }
}

/** Prisons' description of itself to the shell. */
export const shellConfig: ShellConfig = {
  labels: useLabels,
  brand: useBrand,
  nav: useNav,
  counts: useCounts,
  home: { key: 'today', kind: 'today', to: '/', title: () => m.workspace_today() },
  identity: { resolve: resolveIdentity, icon: tabIcon, label: tabLabel, useRecordTitle },
  search: useSearch,
  quickAdd: useQuickAdd,
  footer: useFooter,
  persistedExtras: ['sidebarView', 'rightMode', 'areasTouched'],
  rightPanelTemporary: true,
  rightToggle: 'app',
  onShortcut: (event) => {
    if (event.key.toLowerCase() !== 'j' || !(event.ctrlKey || event.metaKey) || event.altKey) return false
    window.dispatchEvent(new Event(TOGGLE_ASSISTANT_EVENT))
    return true
  },
  slots: { licenceBar: LicenceBar, headerEnd: HeaderEnd, statusBar: StatusBar, rightPanelHeader: RightPanelHeader, rightPanel: RightPanelContent },
}

