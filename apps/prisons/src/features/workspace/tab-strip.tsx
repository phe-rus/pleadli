import { PinIcon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { useEffect, useRef, useState } from 'react'
import { useTabActions } from './tab-actions'
import { tabIcon } from './tab-icon'
import { useWorkspace, type WorkspaceTab } from './tabs-store'
import { m } from '@/paraglide/messages'

const iconButton =
  'flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground'

/** One open tab. The label is the tab's saved title (a prisoner's name once
 * their file has loaded). Unpinned tabs show pin and close on hover; a pinned
 * tab keeps its pin showing and cannot be closed until unpinned. Dragging a
 * tab onto another reorders them. */
function TabItem({ tab, dragging, onDragging }: { tab: WorkspaceTab; dragging: string | null; onDragging: (key: string | null) => void }) {
  const { activeKey, togglePinned, moveTab } = useWorkspace()
  const { activate, close } = useTabActions()
  const active = activeKey === tab.key
  const pinned = tab.pinned === true
  const fixed = tab.kind === 'today'

  return (
    <div
      role="presentation"
      draggable={!fixed}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        onDragging(tab.key)
      }}
      onDragOver={(event) => dragging && !fixed && event.preventDefault()}
      onDrop={() => {
        if (dragging) moveTab(dragging, tab.key)
        onDragging(null)
      }}
      onDragEnd={() => onDragging(null)}
      onAuxClick={(event) => {
        if (event.button === 1) close(tab.key)
      }}
      data-active={active || undefined}
      className={cn(
        // Tabs share the strip like a browser's: they open long and give way
        // evenly as they multiply, down to a readable minimum. The strip holds
        // five at most, so it never has to scroll at a normal window width.
        'group/tab relative flex h-8 min-w-28 items-center gap-1.5 rounded-t-lg pr-1.5 pl-3 text-sm whitespace-nowrap select-none',
        fixed ? 'flex-[0_1_9rem]' : 'flex-[0_1_15rem]',
        'transition-colors duration-100 motion-reduce:transition-none',
        // The open tab is a filled tab with an accent line along its foot, on
        // the header's own hairline.
        active
          ? 'bg-secondary text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
        dragging === tab.key && 'opacity-50',
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        onClick={() => activate(tab)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <HugeiconsIcon icon={tabIcon(tab)} className="size-4 shrink-0" />
        <span className="truncate">{tab.title}</span>
      </button>
      {!fixed && (
        <>
          <button
            type="button"
            aria-label={pinned ? m.workspace_unpin_2({ title: tab.title }) : m.workspace_pin_2({ title: tab.title })}
            title={pinned ? m.workspace_unpin() : m.workspace_pin()}
            onClick={() => togglePinned(tab.key)}
            className={cn(iconButton, !pinned && 'opacity-0 group-focus-within/tab:opacity-100 group-hover/tab:opacity-100')}
          >
            <HugeiconsIcon icon={PinIcon} className={cn('size-3.5', pinned && 'text-foreground')} />
          </button>
          {!pinned && (
            <button
              type="button"
              aria-label={m.workspace_close({ title: tab.title })}
              title={m.workspace_close_ctrl_w()}
              onClick={() => close(tab.key)}
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

/** Every open area and record as a tab standing on the bottom of the centre
 * header, five at most. Today leads, pinned. The empty stretch after the last
 * tab is the window's drag handle. */
export function TabStrip() {
  const { tabs, activeKey } = useWorkspace()
  const [dragging, setDragging] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.querySelector('[data-active]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeKey, tabs.length])

  return (
    <div data-tauri-drag-region className="flex min-w-0 flex-1 items-end self-stretch">
      <div ref={listRef} role="tablist" aria-label={m.workspace_open_tabs()} className="no-scrollbar flex min-w-0 items-end gap-1 overflow-x-auto pl-2">
        {tabs.map((tab) => (
          <TabItem key={tab.key} tab={tab} dragging={dragging} onDragging={setDragging} />
        ))}
      </div>
      <div data-tauri-drag-region className="h-full min-w-6 flex-1" />
    </div>
  )
}
