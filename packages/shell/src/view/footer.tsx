import { Logout03Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'

const iconButton = 'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50'

/** Who is signed in and where, with the few things that belong to the person
 * rather than to the work: language, settings, signing out. */
export function SidebarFooterView({
  person,
  languageSelect,
  labels,
  onOpenPerson,
  onSettings,
  onSignOut,
}: {
  person?: { name: string; sub: string; initials: string; avatar?: ReactNode }
  languageSelect: ReactNode
  labels: { settings: string; signOut: string }
  onOpenPerson?: () => void
  onSettings: () => void
  onSignOut?: () => void
}) {
  const body = person && (
    <>
      {person.avatar ?? (
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-primary/80 to-primary text-[0.6875rem] font-semibold text-primary-foreground">
          {person.initials}
        </span>
      )}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[0.8125rem] font-medium text-foreground">{person.name}</span>
        <span className="truncate text-[0.6875rem] text-muted-foreground">{person.sub}</span>
      </span>
    </>
  )
  return (
    <div className="flex items-center gap-1 px-2 py-2">
      {person ? (
        onOpenPerson ? (
          <button type="button" onClick={onOpenPerson} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-foreground/5">
            {body}
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1">{body}</span>
        )
      ) : (
        <span className="flex-1" />
      )}
      <span className="text-xs text-muted-foreground">{languageSelect}</span>
      <button type="button" className={iconButton} onClick={onSettings} aria-label={labels.settings} title={labels.settings}>
        <HugeiconsIcon icon={Settings01Icon} className="size-4" />
      </button>
      {onSignOut && (
        <button type="button" className={iconButton} onClick={onSignOut} aria-label={labels.signOut} title={labels.signOut}>
          <HugeiconsIcon icon={Logout03Icon} className="size-4" />
        </button>
      )}
    </div>
  )
}
