import { AddRecordPanel } from '@/components/add-record-panel'
import { DevRoleSwitch } from '@/components/dev-role-switch'
import { ConnectionIndicator } from '@/features/connectivity'
import { LicenceBar } from '@/features/orchestra'
import { m } from '@/paraglide/messages'
import { AiMagicIcon, PanelRightIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { Button } from '@pleadli/ui/button'
import { useWorkspace } from '@pleadli/shell'
import { useLocation } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'
import { AssistantPanel } from './assistant/assistant-panel'
import { PrisonerContext } from './context-panel'
import { setMoreOpen, TOGGLE_ASSISTANT_EVENT, useMoreOpen } from './panel-state'
import { identityForPath } from './tab-identity'

export { LicenceBar }

type RightMode = 'assistant' | 'record'

/** The prisoner whose file is in view, if any. */
function usePrisonerInView(): string | null {
  const pathname = useLocation({ select: (location) => location.pathname })
  const identity = identityForPath(pathname)
  return identity?.kind === 'prisoner' ? identity.recordId : null
}

/** Opens the side panel on `mode`, or folds it if it is already showing that. */
function useToggleRight() {
  const { rightOpen, setRightOpen, extras, setExtra } = useWorkspace()
  const current: RightMode = extras.rightMode === 'record' ? 'record' : 'assistant'
  return (mode: RightMode) => {
    if (rightOpen && current === mode) return setRightOpen(false)
    setExtra('rightMode', mode)
    setRightOpen(true)
  }
}

/** The assistant and, on a prisoner's file, that person's details, as buttons
 * at the end of the header; the "more" drawer that the + menu opens. */
export function HeaderEnd() {
  const { rightOpen, extras } = useWorkspace()
  const toggleRight = useToggleRight()
  const moreOpen = useMoreOpen()
  const prisonerId = usePrisonerInView()
  const mode: RightMode = extras.rightMode === 'record' ? 'record' : 'assistant'
  const assistantOpen = rightOpen && mode === 'assistant'
  const recordOpen = rightOpen && mode === 'record'

  useEffect(() => {
    const handler = () => toggleRight('assistant')
    window.addEventListener(TOGGLE_ASSISTANT_EVENT, handler)
    return () => window.removeEventListener(TOGGLE_ASSISTANT_EVENT, handler)
  })

  const button = (label: string, pressed: boolean, onClick: () => void, icon: ReactNode) => (
    <Button size="icon-sm" variant={pressed ? 'secondary' : 'ghost'} onClick={onClick} aria-label={label} aria-pressed={pressed} title={label} className="cursor-pointer">
      {icon}
    </Button>
  )

  return (
    <>
      {import.meta.env.DEV && <DevRoleSwitch />}
      <span className="shell-capsule">
        {button(m.shell_assistant(), assistantOpen, () => toggleRight('assistant'), <HugeiconsIcon icon={AiMagicIcon} className={cn('size-4', assistantOpen && 'text-primary')} />)}
        {prisonerId && button(m.shell_right_record(), recordOpen, () => toggleRight('record'), <HugeiconsIcon icon={PanelRightIcon} className="size-4" />)}
      </span>
      <AddRecordPanel open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  )
}

/** The side panel's header: the assistant, and the record when a prisoner's file is in view. */
export function RightPanelHeader() {
  const { extras, setExtra } = useWorkspace()
  const prisonerId = usePrisonerInView()
  const mode: RightMode = extras.rightMode === 'record' && prisonerId ? 'record' : 'assistant'
  const tab = (value: RightMode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => setExtra('rightMode', value)}
      className={cn(
        'cursor-pointer rounded-sm px-2.5 py-0.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
        mode === value ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
  return (
    <div role="tablist" aria-label={m.shell_right_panel()} className="flex gap-0.5 rounded-md bg-foreground/5 p-0.5">
      {tab('assistant', m.shell_right_assistant())}
      {prisonerId && tab('record', m.shell_right_record())}
    </div>
  )
}

/** The assistant everywhere, or the open prisoner's context beside it. */
export function RightPanelContent() {
  const { rightOpen, extras } = useWorkspace()
  const prisonerId = usePrisonerInView()
  return extras.rightMode === 'record' && prisonerId ? rightOpen && <PrisonerContext prisonerId={prisonerId} /> : <AssistantPanel />
}

/** The foot of the window: the link to Head Office. */
export const StatusBar = () => <ConnectionIndicator />
