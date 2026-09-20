import { Notification01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useWorkspace } from '@/features/workspace/tabs-store'
import { useUnreadCount } from './queries'
import { m } from '@/paraglide/messages'

/** The inbox in the ribbon, with the number still needing this officer's
 * attention. A small count, never a popup: clicking opens the inbox as a
 * tab. */
export function InboxBell() {
  const navigate = useNavigate()
  const active = useLocation({ select: (location) => location.pathname === '/inbox' })
  const { data: unread = 0 } = useUnreadCount()
  const { setSidebarView, setLeftOpen } = useWorkspace()
  const label = unread > 0 ? `Inbox, ${unread} unread` : m.notifications_inbox()

  return (
    <Button
      size="icon"
      variant={active ? 'secondary' : 'ghost'}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={label}
      onClick={() => {
        // The message list opens in the sidebar, even if it was folded away.
        setSidebarView('inbox')
        setLeftOpen(true)
        void navigate({ to: '/inbox' })
      }}
      className="relative cursor-pointer"
    >
      <HugeiconsIcon icon={Notification01Icon} />
      {unread > 0 && (
        <span
          aria-hidden
          className={cn(
            'absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1',
            'text-[0.625rem] leading-none font-semibold text-primary-foreground tabular-nums',
          )}
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Button>
  )
}

/** The same count in words, for the status bar. Nothing when nothing waits. */
export function InboxCount() {
  const navigate = useNavigate()
  const { data: unread = 0 } = useUnreadCount()
  const { setSidebarView, setLeftOpen } = useWorkspace()
  if (unread === 0) return null
  return (
    <button
      type="button"
      onClick={() => {
        setSidebarView('inbox')
        setLeftOpen(true)
        void navigate({ to: '/inbox' })
      }}
      className="flex cursor-pointer items-center gap-1 rounded-sm px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <HugeiconsIcon icon={Notification01Icon} className="size-3" aria-hidden />
      {m.notifications_unread_2({ unread })}</button>
  )
}
