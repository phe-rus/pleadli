import * as m from '@/paraglide/messages'
import { custodyLimits } from '@/features/custody/schema'
import { isNavActive, navFor, sectionsFor, type NavItem } from '@/data/navigationItems'
import { BrandLogo } from '@/features/brand'
import { CommandMenu } from '@/components/command-menu'
import { StatusBarLanguageSelect } from '@/features/i18n'
import { CustodyRecordForm } from '@/features/custody'
import { IncidentForm } from '@/features/incidents'
import { PersonForm } from '@/features/people'
import { StationDiaryEntryForm } from '@/features/station-diary'
import { signOut, useInstallation, useMe } from '@/features/session'
import { stationProfileOptions } from '@/features/station-admin/queries'
import { BinocularsIcon, CellsIcon, Notebook01Icon, SirenIcon, UserGroupIcon } from '@hugeicons/core-free-icons'
import type { NavModel, NavRow, QuickAddItem, ShellConfig, ShellLabels } from '@pleadli/shell'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { useCases } from '@/features/cases'
import { CreateFrame, QuickCaseForm } from './quick-add'
import { useRecordTitle } from './record-title'
import { HeaderEnd, LicenceBar, StatusBar } from './slots'
import { useStationCounts } from './station-counts'
import { resolveIdentity, tabIcon, tabLabel } from './tab-identity'

/** Police words for the shell, from Police's own translations. */
const useLabels = (): ShellLabels => ({
  sidebar: m["workspace.sidebar"](),
  places: m["workspace.places"](),
  search: m["workspace.search"](),
  quickAdd: m["workspace.quick_actions"](),
  find: m["workspace.find"](),
  start: m["workspace.start"](),
  settings: m["nav.settings"](),
  signOut: m["workspace.sign_out"](),
  loading: m["workspace.loading"](),
  openTabs: m["workspace.open_tabs"](),
  window: m["workspace.window"](),
  previousTab: m["workspace.previous_tab"](),
  nextTab: m["workspace.next_tab"](),
  previousTabWith: (key) => m["workspace.previous_tab_with"]({ key }),
  nextTabWith: (key) => m["workspace.next_tab_with"]({ key }),
  pin: m["workspace.pin"](),
  unpin: m["workspace.unpin"](),
  pinTab: (title) => m["workspace.pin_tab"]({ title }),
  unpinTab: (title) => m["workspace.unpin_tab"]({ title }),
  closeTab: (title) => m["workspace.close_tab"]({ title }),
  closeWith: (key) => m["workspace.close_with"]({ key }),
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

const rowOf = (item: NavItem): NavRow => ({ id: item.to, to: item.to, label: item.label, icon: item.icon, match: ({ pathname }) => isNavActive(item, pathname) })

/** The sidebar as data: the day and the front desk first (no heading), then the
 * cells, the cases as folders, the papers a case gathers, and the station. */
const useNav = (): NavModel => {
  const mode = useInstallation().data?.mode
  const items = navFor(mode)
  // The case being worked follows you: it sits under Cases by its reference while it is open.
  const pathname = useRouterState({ select: (r) => r.location.pathname })
  const openId = /^\/investigations\/([^/]+)/.exec(pathname)?.[1]
  const { data: cases } = useCases('')
  const open = openId ? cases?.find((c) => c.id === openId) : undefined
  const inSection = (id: string) => items.filter((item) => item.section === id).map(rowOf)
  const today = items.find((item) => item.to === '/' && item.section === 'main')!
  return {
    today: rowOf(today),
    sections: [
      { id: 'main', rows: inSection('main').filter((row) => row.to !== '/') },
      ...sectionsFor(mode).map((section) =>
        section.id === 'cases'
          ? {
              id: section.id,
              label: section.label,
              // One place for every case: where each stands is shown on the case, and filtered on the page.
              rows: [
                { id: 'cases', to: '/investigations', label: m["nav.cases"](), icon: BinocularsIcon, match: ({ pathname }: { pathname: string }) => pathname === '/investigations' },
                ...(open ? [{ id: `case:${open.id}`, to: `/investigations/${open.id}`, label: `${m["nav.investigation"]()} ${open.reference.split(" ").slice(-2).join(" ")}`, icon: BinocularsIcon, match: ({ pathname }: { pathname: string }) => pathname.startsWith(`/investigations/${open.id}`) }] : []),
                ...inSection('cases'),
              ],
            }
          : { id: section.id, label: section.label, rows: inSection(section.id) },
      ),
    ],
  }
}

/** The count a place carries: work waiting, never a register's size. Custody
 * shows who is due first (in red), and only when nobody is, who is in. */
const useCounts = () => {
  const counts = useStationCounts()
  const items = navFor(useInstallation().data?.mode)
  if (!counts) return {}
  const out: Record<string, { value: number; urgent?: boolean }> = {
    cases: { value: counts.investigating + counts.withDpp },
  }
  for (const item of items) {
    if (item.count === 'inCells') out[item.to] = counts.custodyDue > 0 ? { value: counts.custodyDue, urgent: true } : { value: counts.inCells }
    else if (item.count === 'stationsAttention') out[item.to] = { value: counts.stationsAttention, urgent: true }
    else if (item.count) out[item.to] = { value: counts[item.count] }
  }
  return out
}

const useSearch = () => ({ enabled: useInstallation().data?.mode === 'station', menu: CommandMenu })

/** What an officer most often needs to start. A station only; a command holds none of these records. */
const useQuickAdd = (): QuickAddItem[] => {
  const station = useInstallation().data?.mode === 'station'
  if (!station) return []
  const item = (id: string, icon: QuickAddItem['icon'], title: string, description: string, render: NonNullable<QuickAddItem['panel']>['render']): QuickAddItem => ({ id, label: title, icon, panel: { title, description, render } })
  return [
    item('diary', Notebook01Icon, m["quick.diary_title"](), m["quick.diary_desc"](), ({ onDirtyChange, close }) => <StationDiaryEntryForm onDirtyChange={onDirtyChange} onSuccess={close} />),
    item('incident', SirenIcon, m["quick.incident_title"](), m["quick.incident_desc"](), ({ onDirtyChange, close }) => <IncidentForm onDirtyChange={onDirtyChange} onSuccess={close} />),
    item('case', BinocularsIcon, m["quick.case_title"](), m["quick.case_desc"](), (context) => <QuickCaseForm {...context} />),
    item('custody', CellsIcon, m["quick.custody_title"](), m["quick.custody_desc"](custodyLimits()), ({ onDirtyChange, close }) => <CustodyRecordForm onDirtyChange={onDirtyChange} onSuccess={close} />),
    item('person', UserGroupIcon, m["quick.person_title"](), m["quick.person_desc"](), ({ close }) => <PersonForm onSuccess={close} />),
  ]
}

const useBrand = () => {
  const { data: installation } = useInstallation()
  const { data: profile } = useQuery(stationProfileOptions())
  const command = installation?.mode === 'command'
  return { product: m["workspace.product"](), office: profile?.name || (command ? m["workspace.command_not_named"]() : m["workspace.station_not_named"]()), crest: <BrandLogo className="size-8 shrink-0" /> }
}

/** Who is signed in and where, with the few things that belong to the officer rather than to the work. */
const useFooter = () => {
  const { data: profile } = useQuery(stationProfileOptions())
  const { data: me } = useMe()
  const queryClient = useQueryClient()
  const initials = (me?.name ?? '').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  return {
    person: me ? {
      name: [me.rank, me.name].filter(Boolean).join(' '),
      sub: `${profile?.name ?? m["workspace.not_named"]()}${me.role === 'admin' ? m["workspace.administrator_suffix"]() : ''}`,
      initials,
      to: '/station/officers',
    } : undefined,
    languageSelect: <StatusBarLanguageSelect />,
    settingsTo: '/settings',
    onSignOut: me
      ? () => void signOut().finally(() => {
          queryClient.clear()
          window.location.reload()
        })
      : undefined,
  }
}

/** Police's description of itself to the shell. */
export const shellConfig: ShellConfig = {
  labels: useLabels,
  brand: useBrand,
  nav: useNav,
  counts: useCounts,
  home: { key: 'overview', kind: 'overview', to: '/', title: () => m["nav.overview"]() },
  identity: { resolve: resolveIdentity, icon: tabIcon, label: tabLabel, useRecordTitle },
  search: useSearch,
  quickAdd: useQuickAdd,
  createFrame: CreateFrame,
  footer: useFooter,
  slots: { licenceBar: LicenceBar, headerEnd: HeaderEnd, statusBar: StatusBar },
}
