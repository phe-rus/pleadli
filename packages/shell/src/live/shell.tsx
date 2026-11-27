import { useLocation } from '@tanstack/react-router'
import { Suspense, useEffect, useRef, useState, type FC, type PropsWithChildren } from 'react'
import { shortcut } from '../lib/platform'
import { isHome, type WorkspaceTab } from '../model'
import type { NavRow, ShellConfig } from '../types'
import { QuickAddMenu, SearchButton } from '../view/quick-add'
import { SidebarFooterView } from '../view/footer'
import { HeaderView } from '../view/header'
import { RightPanelFrame } from '../view/right-panel'
import { PillarView, SidebarRow, SidebarSection } from '../view/sidebar'
import { RightPanelToggle, SidebarToggle } from '../view/sidebar-toggle'
import { StatusBarView } from '../view/status-bar'
import { TabStripView, type TabViewModel } from '../view/tab-strip'
import { useGo, useTabActions, useWarm } from './actions'
import { Controls } from './controls'
import { useLabels, useLocationParts, useWorkspace, WorkspaceProvider } from './context'
import { useDisableDevtools } from './devtools'
import { useShellShortcuts } from './shortcuts'

/** Keeps the open tabs in step with the route: every location that is an area
 * or a record opens (or focuses) its tab the moment it is visited, however it
 * was reached. A loaded record gives its tab its own name. */
function ActiveTabSync() {
  const { config, openTab, renameTab, rightLocked, setRightOpen } = useWorkspace()
  const locked = useRef(rightLocked)
  locked.current = rightLocked
  const { pathname, search } = useLocationParts()
  const searchKey = JSON.stringify(search)
  const identity = config.identity.resolve({ pathname, search })
  const recordTitle = config.identity.useRecordTitle?.(identity)

  useEffect(() => {
    if (identity) openTab({ key: identity.key, kind: identity.kind, title: identity.title, ...(identity.subtitle ? { subtitle: identity.subtitle } : {}), to: identity.to })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the location is what changes
  }, [pathname, searchKey, openTab])

  // Moving to another place folds a side panel away, unless it is locked open.
  useEffect(() => {
    if (config.rightPanelTemporary && !locked.current) setRightOpen(false)
  }, [pathname, config.rightPanelTemporary, setRightOpen])

  useEffect(() => {
    if (identity && recordTitle) renameTab(identity.key, recordTitle)
  }, [identity?.key, recordTitle, renameTab])

  return null
}

const defaultMatch = (row: NavRow, pathname: string) => {
  const path = row.to.split('?')[0]
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)
}

/** The sidebar's places, from the app's navigation data. */
function Navigator() {
  const { config, sections, toggleSection } = useWorkspace()
  const location = useLocationParts()
  const go = useGo()
  const warm = useWarm()
  const nav = config.nav()
  const counts = config.counts?.() ?? {}
  const labels = useLabels()

  const row = (item: NavRow) => (
    <SidebarRow
      key={item.id}
      icon={item.icon}
      label={item.label}
      active={item.match ? item.match(location) : defaultMatch(item, location.pathname)}
      onOpen={() => go(item.to)}
      onWarm={() => warm(item.to)}
      count={counts[item.id]?.value}
      urgent={counts[item.id]?.urgent}
    />
  )

  return (
    <>
      <nav aria-label={labels.places} className="flex flex-col gap-px pt-2">
        {row(nav.today)}
      </nav>
      {nav.sections.map((section) =>
        section.label ? (
          <SidebarSection key={section.id} id={section.id} label={section.label} open={sections[section.id] ?? true} onToggle={() => toggleSection(section.id)}>
            {section.rows.map(row)}
          </SidebarSection>
        ) : (
          <div key={section.id} className="flex flex-col gap-px">
            {section.rows.map(row)}
          </div>
        ),
      )}
    </>
  )
}

/** Search and "+" above the sidebar, with the panels the "+" opens. */
function SidebarTop() {
  const { config, setSearchOpen, quickAddOpen, setQuickAddOpen } = useWorkspace()
  const labels = useLabels()
  const search = config.search()
  const items = config.quickAdd()
  const [panel, setPanel] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const close = () => {
    setPanel(null)
    setDirty(false)
  }
  const Frame = config.createFrame
  const active = items.find((item) => item.id === panel)

  if (!search.enabled && items.length === 0) return null
  return (
    <div className="flex items-center gap-1 px-2 pt-1 pb-1">
      {search.enabled ? <SearchButton label={labels.search} hint={shortcut('K')} onOpen={() => setSearchOpen(true)} /> : <span className="flex-1" />}
      {items.length > 0 && (
        <QuickAddMenu
          items={items}
          labels={labels}
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          searchEnabled={search.enabled}
          searchHint={shortcut('K')}
          onSearch={() => setSearchOpen(true)}
          onPick={(id) => {
            const item = items.find((candidate) => candidate.id === id)
            if (item?.run) item.run()
            else setPanel(id)
          }}
        />
      )}
      {active?.panel && Frame && (
        <Frame open onOpenChange={(open) => !open && close()} dirty={dirty} headings={{ title: active.panel.title, description: active.panel.description }}>
          <Suspense fallback={<p className="p-4 text-muted-foreground">{labels.loading}</p>}>{active.panel.render({ onDirtyChange: setDirty, close })}</Suspense>
        </Frame>
      )}
    </div>
  )
}

function Footer() {
  const { config } = useWorkspace()
  const labels = useLabels()
  const go = useGo()
  const footer = config.footer()
  const person = footer.person
  return (
    <SidebarFooterView
      person={person}
      languageSelect={footer.languageSelect}
      labels={labels}
      onOpenPerson={person?.to ? () => go(person.to!) : undefined}
      onSettings={() => go(footer.settingsTo)}
      onSignOut={footer.onSignOut}
    />
  )
}

/** The left pillar: the sidebar running the full height of the window. */
function LeftPillar() {
  const { config, leftOpen, setLeftOpen } = useWorkspace()
  const labels = useLabels()
  const brand = config.brand()
  return (
    <PillarView
      open={leftOpen}
      label={labels.sidebar}
      controls={
        <>
          <Controls />
          <span data-tauri-drag-region className="flex-1" />
          <SidebarToggle open={leftOpen} label={labels.hideSidebar} onToggle={() => setLeftOpen(false)} />
        </>
      }
      brand={
        <>
          {brand.crest}
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[0.8125rem] leading-4 font-semibold">{brand.product}</span>
            <span className="truncate text-[0.6875rem] leading-4 text-muted-foreground">{brand.office}</span>
          </div>
        </>
      }
      top={<SidebarTop />}
      footer={<Footer />}
    >
      <Navigator />
    </PillarView>
  )
}

function CenterHeader() {
  const { config, tabs, activeKey, rules, leftOpen, setLeftOpen, rightOpen, setRightOpen, togglePinned, moveTab } = useWorkspace()
  const labels = useLabels()
  const { activate, close } = useTabActions()
  const HeaderEnd = config.slots?.headerEnd
  const strip = config.strip
  const Accessory = strip?.accessory

  // The strip draws what the app says it should (default: every tab). The rest stay open and in Recent.
  const drawn = strip?.shows ? tabs.filter((tab) => strip.shows!(tab)) : tabs
  const cycle = (delta: 1 | -1) => {
    if (drawn.length < 2) return
    const at = drawn.findIndex((tab) => tab.key === activeKey)
    const target = at === -1 ? (delta === 1 ? drawn[0] : drawn[drawn.length - 1]) : drawn[(at + delta + drawn.length) % drawn.length]
    if (target) activate(target)
  }

  const models: TabViewModel[] = drawn.map((tab) => ({
    accessory: Accessory ? <Accessory tab={tab} /> : undefined,
    key: tab.key,
    title: config.identity.label?.(tab) ?? (isHome(rules, tab) ? config.home.title() : tab.title),
    icon: config.identity.icon(tab),
    pinned: tab.pinned === true,
    fixed: isHome(rules, tab),
  }))
  const byKey = (key: string): WorkspaceTab | undefined => tabs.find((tab) => tab.key === key)

  return (
    <HeaderView
      leading={
        !leftOpen && (
          <>
            <Controls />
            <SidebarToggle open={false} label={labels.showSidebar} onToggle={() => setLeftOpen(true)} />
          </>
        )
      }
      tabs={
        <TabStripView
          tabs={models}
          pinning={strip?.pinning ?? true}
          activeKey={activeKey}
          labels={{ ...labels, closeWith: labels.closeWith(shortcut('W')) }}
          onActivate={(key) => {
            const tab = byKey(key)
            if (tab) activate(tab)
          }}
          onClose={close}
          onTogglePin={togglePinned}
          onMove={moveTab}
        />
      }
      end={
        <>
          {HeaderEnd && <HeaderEnd />}
          {config.rightToggle !== 'app' && <RightPanelToggle open={rightOpen} label={rightOpen ? labels.rightPanel.close : labels.rightPanel.open} onToggle={() => setRightOpen(!rightOpen)} />}
        </>
      }
      labels={{ ...labels, previousTabWith: labels.previousTabWith(shortcut('⇧Tab')), nextTabWith: labels.nextTabWith(shortcut('Tab')) }}
      canCycle={drawn.length > 1}
      onCycle={cycle}
    />
  )
}

function RightPanel() {
  const { config, rightOpen, setRightOpen, rightWidth, setRightWidth, rightLocked, toggleRightLocked } = useWorkspace()
  const labels = useLabels()
  const Content = config.slots?.rightPanel
  const Header = config.slots?.rightPanelHeader
  return (
    <RightPanelFrame
      open={rightOpen}
      width={rightWidth}
      locked={rightLocked}
      labels={labels.rightPanel}
      headerStart={Header ? <Header /> : undefined}
      onWidth={setRightWidth}
      onToggleLock={toggleRightLocked}
      onClose={() => setRightOpen(false)}
    >
      {Content ? <Content /> : <p className="p-4 text-muted-foreground">{labels.rightPanel.empty}</p>}
    </RightPanelFrame>
  )
}

function ShellFrame({ children }: PropsWithChildren) {
  const { config, searchOpen, setSearchOpen } = useWorkspace()
  const search = config.search()
  useShellShortcuts(search.enabled)
  const LicenceBar = config.slots?.licenceBar
  const AboveContent = config.slots?.aboveContent
  const StatusBar = config.slots?.statusBar
  const Menu = search.menu

  // A new place opens at its top, as a Mac window does; switching folders inside one place keeps the position.
  const scroller = useRef<HTMLDivElement>(null)
  const pathname = useLocation({ select: (location) => location.pathname })
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="h-full min-h-0 w-full overflow-hidden print:h-auto print:overflow-visible">
      {search.enabled && <Menu open={searchOpen} onOpenChange={setSearchOpen} />}
      {/* The sidebar runs the full height of the window, top to bottom. The status bar (what is
          happening right now) lives under the work area only, never under the sidebar. */}
      <div className="flex h-full w-full overflow-hidden bg-background print:block print:h-auto print:overflow-visible">
        <LeftPillar />
        <div className="flex min-w-0 flex-1 flex-col print:block">
          <div className="flex min-h-0 flex-1 print:block">
            <div className="flex min-w-0 flex-1 flex-col print:block">
              <CenterHeader />
              {LicenceBar && <LicenceBar />}
              {AboveContent && <AboveContent />}
              <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background print:block print:overflow-visible">
                <div ref={scroller} className="no-scrollbar min-h-0 flex-1 overflow-y-auto print:overflow-visible">{children}</div>
              </main>
            </div>
            <RightPanel />
          </div>
          <StatusBarView>{StatusBar && <StatusBar />}</StatusBarView>
        </div>
      </div>
    </div>
  )
}

/** The window every app lives in: the sidebar, the tabs over the page, the
 * right panel and the status bar. What is open is remembered on this machine
 * under `storageKey`; pass a key that changes with the installation so one
 * installation never reopens another's tabs. */
export const WorkspaceShell: FC<PropsWithChildren<{ config: ShellConfig; storageKey: string }>> = ({ config, storageKey, children }) => {
  useDisableDevtools()
  return (
    <WorkspaceProvider key={storageKey} config={config} storageKey={storageKey}>
      <ActiveTabSync />
      <ShellFrame>{children}</ShellFrame>
    </WorkspaceProvider>
  )
}
