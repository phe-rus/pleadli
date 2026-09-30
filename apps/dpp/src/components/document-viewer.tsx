import { getAttachmentDataUrl, openAttachment } from '@/features/attachments/data'
import * as m from '@/paraglide/messages'
import { ArrowExpand01Icon, ArrowShrink02Icon, Cancel01Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@pleadli/ui/dialog'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

/** A scan, photo or PDF shown inside the app, at a page when one is given. */
export function DocumentView({ attachmentId, page, title, className }: { attachmentId: string; page?: number | null; title: string; className?: string }) {
  const { data: url, isLoading } = useQuery({ queryKey: ['attachment-url', attachmentId], queryFn: () => getAttachmentDataUrl(attachmentId), staleTime: Infinity })
  if (isLoading) return <div className={cn('animate-pulse rounded-xl bg-secondary', className)} />
  if (!url) return <p className="text-muted-foreground">{m["viewer.cannot_show"]()}</p>
  const isImage = url.startsWith('data:image') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)
  const isPdf = url.startsWith('data:application/pdf') || /pdf/i.test(url) || !isImage
  if (isImage) return <img src={url} alt={title} className={cn('w-full rounded-xl object-contain ring-1 ring-border/60', className)} />
  if (isPdf) return <iframe title={title} src={`${url}#page=${page ?? 1}&view=FitH`} className={cn('w-full rounded-xl bg-white ring-1 ring-border/60', className)} />
  return null
}

/** The viewer as a window over the app: large by default, full screen on
 * demand, closed with Escape. Nothing opens in another tab or program unless
 * asked for. */
export function DocumentViewer({ attachmentId, page, title, open, onOpenChange }: { attachmentId: string; page?: number | null; title: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [full, setFull] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex flex-col gap-3 p-3 transition-all',
          full ? 'h-dvh max-h-dvh w-screen max-w-none rounded-none sm:max-w-none' : 'h-[88dvh] w-[92vw] max-w-5xl sm:max-w-5xl',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <DialogTitle className="truncate text-base">{title}</DialogTitle>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon-sm" variant="ghost" onClick={() => openAttachment({ id: attachmentId })} aria-label={m["viewer.open_outside"]()} title={m["viewer.open_outside"]()}>
              <HugeiconsIcon icon={LinkSquare02Icon} />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setFull((f) => !f)} aria-label={full ? m["viewer.exit_full"]() : m["viewer.full"]()} title={full ? m["viewer.exit_full"]() : m["viewer.full"]()}>
              <HugeiconsIcon icon={full ? ArrowShrink02Icon : ArrowExpand01Icon} />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => onOpenChange(false)} aria-label={m["board.close"]()}>
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </div>
        </div>
        <DocumentView attachmentId={attachmentId} page={page} title={title} className="min-h-0 flex-1" />
      </DialogContent>
    </Dialog>
  )
}
