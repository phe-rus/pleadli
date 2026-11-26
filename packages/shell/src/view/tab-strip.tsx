import { PinIcon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export type TabViewModel = { key: string; title: string; icon: IconSvgElement; pinned: boolean; fixed: boolean; accessory?: ReactNode }
export type TabStripLabels = {
  openTabs: string
  pin: string
  unpin: string
  pinTab: (title: string) => string
  unpinTab: (title: string) => string
  closeTab: (title: string) => string
  /** The hint after "close", such as "Ctrl W". */
  closeWith: string
}

const iconButton =
  'flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground'

type TabViewProps = {
  tab: TabViewModel
  active: boolean
  dragging: string | null
  labels: TabStripLabels
  pinning?: boolean
  onDragging: (key: string | null) => void
  onActivate: (key: string) => void
  onClose: (key: string) => void
  onTogglePin: (key: string) => void
  onMove: (fromKey: string, toKey: string) => void
}

/** One open tab. Unpinned tabs show pin and close on hover; a pinned tab keeps
 * its pin showing and cannot be closed until unpinned; the fixed first tab has
 * neither. Dragging a tab onto another reorders them. */
export function TabView({ tab, active, dragging, labels, pinning = true, onDragging, onActivate, onClose, onTogglePin, onMove }: TabViewProps) {
  return (
    <div
      role="presentation"
      draggable={!tab.fixed}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        onDragging(tab.key)
      }}
      onDragOver={(event) => dragging && !tab.fixed && event.preventDefault()}
      onDrop={() => {
        if (dragging) onMove(dragging, tab.key)
        onDragging(null)
      }}
      onDragEnd={() => onDragging(null)}
      onAuxClick={(event) => {
        if (event.button === 1) onClose(tab.key)
      }}
      data-active={active || undefined}
      className={cn(
        'group/tab relative flex h-7.5 min-w-24 items-center gap-1 rounded-lg pr-1 pl-2.5 text-[0.8125rem] whitespace-nowrap select-none',
        tab.fixed ? 'flex-none' : 'flex-[0_1_13rem]',
        'transition-colors duration-(--shell-motion-tab) motion-reduce:transition-none',
        active ? 'bg-background font-medium text-foreground shadow-xs ring-1 ring-black/[0.06] dark:bg-foreground/10' : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
        dragging === tab.key && 'opacity-50',
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        onClick={() => onActivate(tab.key)}
        title={tab.title}
        className="flex min-w-0 flex-1 cursor-default items-center gap-1.5 rounded-sm py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <HugeiconsIcon icon={tab.icon} className="size-3.5 shrink-0 opacity-70" />
        <span className="truncate">{tab.title}</span>
        {tab.accessory}
      </button>
      {!tab.fixed && (
        <>
          {(pinning || tab.pinned) && <button
            type="button"
            aria-label={tab.pinned ? labels.unpinTab(tab.title) : labels.pinTab(tab.title)}
            title={tab.pinned ? labels.unpin : labels.pin}
            onClick={() => onTogglePin(tab.key)}
            className={cn(iconButton, !tab.pinned && 'opacity-0 group-focus-within/tab:opacity-100 group-hover/tab:opacity-100')}
          >
            <HugeiconsIcon icon={PinIcon} className={cn('size-3.5', tab.pinned && 'text-foreground')} />
          </button>}
          {!tab.pinned && (
            <button
              type="button"
              aria-label={labels.closeTab(tab.title)}
              title={labels.closeWith}
              onClick={() => onClose(tab.key)}
              className={cn(iconButton, 'opacity-0 group-focus-within/tab:opacity-100 group-hover/tab:opacity-100', active && 'opacity-70')}
            >
              <HugeiconsIcon icon={XIcon} className="size-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** The open tabs as a strip. The empty stretch after the last tab is the
 * window's drag handle. */
export function TabStripView({ tabs, activeKey, labels, pinning, onActivate, onClose, onTogglePin, onMove }: Omit<TabViewProps, 'tab' | 'active' | 'dragging' | 'onDragging'> & { tabs: readonly TabViewModel[]; activeKey: string | null }) {
  const [dragging, setDragging] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.querySelector('[data-active]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeKey, tabs.length])

  return (
    <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center self-stretch">
      <div ref={listRef} data-tauri-drag-region role="tablist" aria-label={labels.openTabs} className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 self-stretch overflow-x-auto px-2">
        {tabs.map((tab) => (
          <TabView
            key={tab.key}
            tab={tab}
            active={activeKey === tab.key}
            dragging={dragging}
            labels={labels}
            pinning={pinning}
            onDragging={setDragging}
            onActivate={onActivate}
            onClose={onClose}
            onTogglePin={onTogglePin}
            onMove={onMove}
          />
        ))}
      </div>
    </div>
  )
}
