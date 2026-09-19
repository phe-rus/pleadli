import { ApiError } from '@/lib/api'
import { CheckmarkCircle02Icon, Copy01Icon, SmartPhone01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useEffect, useRef, useState } from 'react'
import { closeCaptureSession, getCaptureStatus, openCaptureSession } from './data'
import { photoViewLabel, photoViews, type CaptureSession, type PhotoView } from './schema'

type Taken = Record<PhotoView, string | null>

/**
 * A button that opens a short-lived link a phone (or any device on the
 * facility network) uses to send the photos straight to this screen. The
 * session lives only while this component is mounted: leaving the step
 * closes it and the node discards anything not yet collected.
 */
export function PhoneLink({ taken, onPhotos }: { taken: Taken; onPhotos: (batch: Partial<Taken>) => void }) {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState<CaptureSession | null>(null)
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null)
  const [starting, setStarting] = useState(false)
  const known = useRef<string[]>([])
  const sessionRef = useRef<CaptureSession | null>(null)
  sessionRef.current = session

  useEffect(
    () => () => {
      const live = sessionRef.current
      if (live) void closeCaptureSession(live.sessionId).catch(() => undefined)
    },
    [],
  )

  const start = async () => {
    setStarting(true)
    setFailure(null)
    try {
      known.current = []
      setSession(await openCaptureSession())
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? { code: error.code, message: error.message }
          : { code: 'UNKNOWN', message: 'The link could not be made. Try again.' },
      )
    } finally {
      setStarting(false)
    }
  }

  const expired = session ? session.expiresAt < Date.now() : false

  const status = useQuery({
    queryKey: ['capture-status', session?.sessionId] as const,
    queryFn: () => getCaptureStatus(session!.sessionId, known.current),
    enabled: Boolean(session) && !expired,
    refetchInterval: 3000,
    gcTime: 0,
  })

  useEffect(() => {
    if (!status.data) return
    const batch: Partial<Taken> = {}
    for (const photo of status.data.photos) {
      if (photo.dataUrl && !known.current.includes(photo.photoId)) {
        known.current.push(photo.photoId)
        batch[photo.view] = photo.dataUrl
      }
    }
    if (Object.keys(batch).length > 0) onPhotos(batch)
  }, [status.data, onPhotos])

  const arrived = photoViews.filter((view) => taken[view]).length

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="secondary"
        onClick={() => {
          setOpen(true)
          if (!session || expired) void start()
        }}
      >
        <HugeiconsIcon icon={SmartPhone01Icon} size={12} /> Phone link
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take the photos with a phone</DialogTitle>
            <DialogDescription>
              Scan the code or open the link on a phone connected to this facility network. Each photo it takes appears in the slots on this screen.
            </DialogDescription>
          </DialogHeader>

          {failure ? (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4 text-sm">
              <p>{failure.code === 'NOT_SERVING' ? 'Turn on serving workstations to use a phone as a camera.' : failure.message}</p>
              {failure.code === 'NOT_SERVING' ? (
                <Link to="/settings" search={{ tab: 'node' }} className="w-fit text-xs underline underline-offset-4" onClick={() => setOpen(false)}>
                  Open Settings, Node and backups
                </Link>
              ) : (
                <Button type="button" size="xs" onClick={() => void start()} disabled={starting}>
                  Try again
                </Button>
              )}
            </div>
          ) : !session || starting ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Making a link…</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div
                  className="size-44 shrink-0 rounded-lg bg-white p-2 [&>svg]:size-full"
                  aria-label="QR code for the phone link"
                  dangerouslySetInnerHTML={{ __html: session.qrSvg }}
                />
                <div className="flex min-w-0 flex-1 basis-48 flex-col gap-2">
                  <input
                    readOnly
                    value={session.url}
                    onFocus={(event) => event.currentTarget.select()}
                    className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-[11px] outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="xs"
                      onClick={() => {
                        void navigator.clipboard?.writeText(session.url)
                        t.success('Link copied')
                      }}
                    >
                      <HugeiconsIcon icon={Copy01Icon} size={12} /> Copy link
                    </Button>
                    {expired && (
                      <Button type="button" size="xs" variant="secondary" onClick={() => void start()} disabled={starting}>
                        New link
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {expired ? 'This link has expired.' : `Works until ${format(session.expiresAt, 'p')}.`} The phone may warn about the connection once, because the node uses its own certificate. Continue to the page.
                  </p>
                </div>
              </div>

              <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60 text-sm">
                {photoViews.map((view) => (
                  <li key={view} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span>{photoViewLabel[view]}</span>
                    {taken[view] ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} /> Received
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Waiting</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">{arrived} of 3 photos in.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
