import { AddCircleIcon, PinIcon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { motion } from 'motion/react'
import { cn } from '@pleadli/ui/lib/utils'
import { useNavigate } from '@tanstack/react-router'
import { useWorkspace, type WorkspaceTab } from './tabs-store'
import { useTabTitle } from './tab-identity'

/** One open record as a flat, Obsidian-style tab: a quiet pill under a thin
 * accent on the active one, noting records it is pinned to the little pin
 * toggle. Its live title comes from the query cache. */
function TabItem({ tab }: { tab: WorkspaceTab }) {
  const { activeKey, closeTab, setActive, isPinned, togglePinned } = useWorkspace()
  const navigate = useNavigate()
  const title = useTabTitle(tab)
  const active = activeKey === tab.key
  const pinned = isPinned(tab.key)

  return (
    <motion.div
      layout
      key={tab.key}
      onClick={() => {
        setActive(tab.key)
        void navigate({ to: tab.to as never })
      }}
      className={cn(
        'group/tab relative flex h-6.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm px-2 text-sm whitespace-nowrap',
        'transition-colors duration-100 ease-out',
        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {tab.kind === 'today' && <HugeiconsIcon icon={PinIcon} className="size-3 shrink-0 text-muted-foreground" />}
      <span className="truncate">{title}</span>
      {tab.subtitle && <span className="hidden text-xs text-muted-foreground sm:inline">· {tab.subtitle}</span>}
      {tab.closable && (
        <button
          type="button"
          aria-label={`Close ${title}`}
          title="Close this record"
          onClick={(event) => {
            event.stopPropagation()
            closeTab(tab.key)
          }}
          className={cn(
            'flex size-3.5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground',
            'opacity-0 transition-opacity group-hover/tab:opacity-70 group-hover/tab:hover:opacity-100',
            active && 'opacity-70',
          )}
        >
          <HugeiconsIcon icon={XIcon} className="size-3" />
        </button>
      )}
      {tab.closable && (
        <button
          type="button"
          aria-label={pinned ? 'Unpin' : 'Pin'}
          title={pinned ? 'Unpin' : 'Pin'}
          onClick={(event) => {
            event.stopPropagation()
            togglePinned(tab.key)
          }}
          className={cn(
            'flex size-3.5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground',
            'opacity-0 transition-opacity group-hover/tab:opacity-70 group-hover/tab:hover:opacity-100',
            active && 'opacity-50',
          )}
        >
          <HugeiconsIcon icon={PinIcon} className={cn('size-3', pinned && 'text-foreground')} />
        </button>
      )}
      {active && (
        <motion.span
          layoutId="active-tab-underline"
          className="absolute inset-x-1.5 -bottom-px z-10 h-0.5 rounded-full bg-primary"
        />
      )}
    </motion.div>
  )
}

/** Open records as flat tabs atop the working pane, Today always first as a
 * pinned lead. Clicking a tab returns to its record; the `+` opens the
 * command palette. */
export function TabStrip() {
  const { tabs, setCommandOpen } = useWorkspace()
  if (tabs.length === 0) return null

  return (
    <div className="no-scrollbar flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border/20 bg-background px-1.5">
      {tabs.map((tab) => (
        <TabItem key={tab.key} tab={tab} />
      ))}
      <button
        type="button"
        aria-label="Open records or commands"
        title="Open a record (Ctrl K)"
        onClick={() => setCommandOpen(true)}
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      >
        <HugeiconsIcon icon={AddCircleIcon} className="size-3.5" />
      </button>
    </div>
  )
}