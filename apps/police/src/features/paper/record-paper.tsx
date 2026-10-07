import * as m from '@/paraglide/messages'
import { BrandLogo } from '@/features/brand'
import { stationProfileOptions } from '@/features/station-admin/queries'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PaperPage, type PaperDetail, type PaperEvent, type PaperLink, type PaperMode } from '@pleadli/paper'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@pleadli/ui/dialog'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

/** The top of every paper the station makes: the crest, the force, and the
 * station's own name and address, as on its letterhead. */
export function StationHead({ subtitle }: { subtitle?: string | null }) {
  const { data: profile } = useQuery(stationProfileOptions())
  return (
    <header className="mb-6 flex flex-col items-center gap-0.5 text-center">
      <BrandLogo className="mb-1 size-12" />
      <p className="text-xs tracking-wide uppercase">{m["charge_sheet.force"]()}</p>
      {profile?.name && <p className="font-semibold uppercase">{profile.name}</p>}
      {profile?.address && <p className="text-xs">{profile.address}</p>}
      {subtitle && <p className="mt-1 text-xs">{subtitle}</p>}
    </header>
  )
}

/**
 * One record as its paper: read as a page, edited in place (Edit shows the
 * record's own form and comes back to the page once saved), written on with
 * a pen or finger, printed, saved as Word, checked by its code.
 */
export function RecordPaper({
  entityType,
  entityId,
  reference,
  title,
  subtitle,
  details,
  events,
  related,
  edit,
  children,
}: {
  entityType: string
  entityId: string
  reference?: string | null
  title: string
  subtitle?: string | null
  details: PaperDetail[]
  events?: PaperEvent[]
  related?: PaperLink[]
  /** The record's form, told how to come back to the page when it is saved. */
  edit?: (done: () => void) => ReactNode
  children: ReactNode
}) {
  const [mode, setMode] = useState<PaperMode>('preview')
  return (
    <PaperPage
      entityType={entityType}
      entityId={entityId}
      reference={reference}
      title={title}
      head={<StationHead subtitle={subtitle} />}
      details={details}
      events={events}
      related={related}
      mode={mode}
      onModeChange={setMode}
      edit={edit ? <div className="mx-auto w-full max-w-2xl rounded-xl bg-card p-5 shadow-xs ring-1 ring-border/70">{edit(() => setMode('preview'))}</div> : undefined}
    >
      {children}
    </PaperPage>
  )
}

/** A paper opened over the list it came from, the way Preview opens a file
 * over Finder: large, scrolling, closed with Escape. */
export function PaperWindow({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-print-viewer showCloseButton={false} className="flex h-[92dvh] w-[94vw] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl print:h-auto print:overflow-visible">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5 print:hidden">
          <DialogTitle className="truncate text-base">{title}</DialogTitle>
          <Button size="icon-sm" variant="ghost" onClick={() => onOpenChange(false)} aria-label={m["viewer.close"]()} title={m["viewer.close"]()}>
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-foreground/[0.025] p-4 sm:p-6 print:overflow-visible print:bg-transparent print:p-0">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
