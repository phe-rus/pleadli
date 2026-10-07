import * as m from '@/paraglide/messages'
import { useAttachmentDataUrl, useClearPersonPhoto } from '@/features/attachments/queries'
import { personPhotoAngles, type Attachment, type PersonPhotoAngle } from '@/features/attachments/schema'
import { api } from '@/lib/api'
import { Camera01Icon, Cancel01Icon, CheckmarkCircle02Icon, MoreHorizontalIcon, SmartPhone01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@pleadli/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { personProfileOptions } from './queries'
import { useEffect, useRef, useState } from 'react'

const ORDER: PersonPhotoAngle[] = ['front', 'right_profile', 'left_profile', 'back']
const labelOf = (angle: PersonPhotoAngle) => personPhotoAngles.find((a) => a.value === angle)!.label
const instruction = (angle: PersonPhotoAngle) =>
  ({ front: m["identity.pose.front"](), left_profile: m["identity.pose.left"](), right_profile: m["identity.pose.right"](), back: m["identity.pose.back"]() })[angle]

/** The outline the person lines up with for each pose: head and shoulders,
 * facing the camera, turned to one side, or turned away. */
function PoseOutline({ angle, className }: { angle: PersonPhotoAngle; className?: string }) {
  const shoulders = 'M14 120 C18 92 36 84 60 84 C84 84 102 92 106 120'
  const head =
    angle === 'front' || angle === 'back'
      ? 'M60 18 C76 18 84 30 84 46 C84 64 74 76 60 76 C46 76 36 64 36 46 C36 30 44 18 60 18 Z'
      : angle === 'right_profile'
        ? 'M56 18 C72 18 82 30 82 44 L88 52 L82 56 C82 66 74 76 60 76 C46 76 38 64 38 46 C38 30 42 18 56 18 Z'
        : 'M64 18 C48 18 38 30 38 44 L32 52 L38 56 C38 66 46 76 60 76 C74 76 82 64 82 46 C82 30 78 18 64 18 Z'
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.4} strokeDasharray="4 3">
      <path d={head} />
      <path d={shoulders} />
    </svg>
  )
}

/** Reads a picked file as a data URL, so a file goes in the same way a camera picture does. */
const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

function useSavePhoto(personId: string) {
  const queryClient = useQueryClient()
  return async (angle: PersonPhotoAngle, dataUrl: string) => {
    await api(`/people/${encodeURIComponent(personId)}/photos/capture`, { method: 'POST', body: JSON.stringify({ angle, data: dataUrl }) })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['attachments', 'person', personId] }),
      queryClient.invalidateQueries({ queryKey: ['people', 'profile', personId] }),
      queryClient.invalidateQueries({ queryKey: ['people', 'search'] }),
    ])
  }
}

type PhoneLink = { token: string; url: string; qrSvg: string; expiresInSecs: number }

/**
 * Taking the photographs with a phone, for a desk without a camera, the way
 * Continuity Camera lends a Mac the iPhone's: scan the code, take each pose on
 * the phone, and every picture appears here as it arrives.
 */
function PhoneCapture({ personId, angles, onDone }: { personId: string; angles: PersonPhotoAngle[]; onDone: () => void }) {
  const [link, setLink] = useState<PhoneLink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { data: profile } = useQuery({ ...personProfileOptions(personId), refetchInterval: 2000 })
  const before = useRef<Map<string, string> | null>(null)

  useEffect(() => {
    let token: string | null = null
    api(`/people/${encodeURIComponent(personId)}/photos/phone`, { method: 'POST' })
      .then((l: PhoneLink) => {
        token = l.token
        setLink(l)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : m["identity.phone_failed"]()))
    return () => {
      if (token) void api(`/phone-capture/${token}`, { method: 'DELETE' }).catch(() => undefined)
      void queryClient.invalidateQueries({ queryKey: ['people', 'search'] })
    }
  }, [personId, queryClient])

  const photos = new Map((profile?.attachments ?? []).filter((a) => a.photoAngle).map((a) => [a.photoAngle as string, a.id]))
  if (profile && !before.current) before.current = photos
  const arrived = angles.filter((a) => photos.get(a) && photos.get(a) !== before.current?.get(a))

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {error ? (
        <p className="text-destructive">{error}</p>
      ) : !link ? (
        <div className="size-48 animate-pulse rounded-2xl bg-foreground/[0.06]" />
      ) : (
        <>
          <div className="size-48 rounded-2xl bg-white p-3 ring-1 ring-black/10 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: link.qrSvg }} />
          <p className="max-w-xs text-muted-foreground">{m["identity.phone_how"]()}</p>
          <p className="max-w-xs text-xs break-all text-muted-foreground/80 select-all">{link.url}</p>
        </>
      )}
      <ul className="flex list-none flex-wrap justify-center gap-2 p-0">
        {angles.map((a) => (
          <li key={a} className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs', arrived.includes(a) ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-foreground/[0.05] text-muted-foreground')}>
            {arrived.includes(a) && <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />}
            {labelOf(a)}
          </li>
        ))}
      </ul>
      <Button size="sm" onClick={onDone}>
        {arrived.length === angles.length ? m["identity.done"]() : m["identity.finish"]()}
      </Button>
    </div>
  )
}

/**
 * Taking the identification photographs, one pose at a time, the way Face
 * ID is set up: the camera with an outline to line up with, one sentence
 * saying what to do, a shutter, then Retake or Use. Where there is no camera
 * the same steps take a picture from a file.
 */
export function IdentityCapture({ personId, open, onOpenChange, angles = ORDER }: { personId: string; open: boolean; onOpenChange: (open: boolean) => void; angles?: PersonPhotoAngle[] }) {
  const steps = angles
  const [step, setStep] = useState(0)
  const [still, setStill] = useState<string | null>(null)
  const [camera, setCamera] = useState<'starting' | 'on' | 'none'>('starting')
  const [saving, setSaving] = useState(false)
  const [phone, setPhone] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const save = useSavePhoto(personId)
  const angle = steps[step]

  useEffect(() => {
    if (!open) return
    setStep(0)
    setStill(null)
    setPhone(false)
    let stream: MediaStream | null = null
    let alive = true
    setCamera('starting')
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((track) => track.stop())
        stream = s
        if (video.current) video.current.srcObject = s
        setCamera('on')
      })
      .catch(() => {
        if (!alive) return
        setCamera('none')
        // No camera here: go straight to the phone, as a Mac offers the iPhone.
        setPhone(true)
      })
    if (!navigator.mediaDevices) {
      setCamera('none')
      setPhone(true)
    }
    return () => {
      alive = false
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [open])

  const shoot = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    // A portrait 3:4 crop from the middle of the frame, as an ID photograph is.
    const h = v.videoHeight
    const w = Math.round((h * 3) / 4)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(v, (v.videoWidth - w) / 2, 0, w, h, 0, 0, w, h)
    setStill(canvas.toDataURL('image/jpeg', 0.9))
  }

  const use = async (dataUrl: string) => {
    setSaving(true)
    try {
      await save(angle, dataUrl)
      setStill(null)
      if (step + 1 < steps.length) setStep(step + 1)
      else onOpenChange(false)
    } catch {
      t.error(m["people.photo_failed"](), { description: m["common.try_again"]() })
    } finally {
      setSaving(false)
    }
  }

  const next = () => (step + 1 < steps.length ? (setStill(null), setStep(step + 1)) : onOpenChange(false))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex w-[94vw] max-w-lg flex-col gap-4 p-5 sm:max-w-lg">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <DialogTitle className="text-base">{phone ? m["identity.phone_title"]() : labelOf(angle)}</DialogTitle>
            <p className="text-muted-foreground">{phone ? (camera === 'none' ? m["identity.no_camera_phone"]() : m["identity.phone_lead"]()) : instruction(angle)}</p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={() => onOpenChange(false)} aria-label={m["viewer.close"]()}>
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        </div>

        {phone ? (
          <PhoneCapture personId={personId} angles={steps} onDone={() => onOpenChange(false)} />
        ) : (
        <>
        <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-zinc-900">
          {still ? (
            <img src={still} alt={labelOf(angle)} className="h-full w-full object-cover" />
          ) : camera === 'none' ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-zinc-300">
              <PoseOutline angle={angle} className="w-2/3 text-zinc-500" />
              <p className="text-sm">{m["identity.no_camera"]()}</p>
            </div>
          ) : (
            <>
              <video ref={video} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
              <PoseOutline angle={angle} className="pointer-events-none absolute inset-x-[12%] bottom-0 w-[76%] text-white/80" />
            </>
          )}
        </div>

        {steps.length > 1 && (
          <div className="flex justify-center gap-1.5" aria-label={m["identity.step"]({ step: step + 1, total: steps.length })}>
            {steps.map((s, i) => (
              <span key={s} className={cn('size-1.5 rounded-full', i === step ? 'bg-foreground' : i < step ? 'bg-foreground/40' : 'bg-foreground/15')} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={next} disabled={saving}>
            {m["identity.skip"]()}
          </Button>
          {still ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setStill(null)} disabled={saving}>
                {m["identity.retake"]()}
              </Button>
              <Button size="sm" onClick={() => void use(still)} disabled={saving}>
                {m["identity.use"]()}
              </Button>
            </div>
          ) : camera === 'on' ? (
            <button
              type="button"
              onClick={shoot}
              aria-label={m["identity.take"]()}
              className="flex size-14 cursor-pointer items-center justify-center rounded-full ring-4 ring-foreground/20 outline-none focus-visible:ring-ring"
            >
              <span className="size-11 rounded-full bg-foreground/90 transition-transform active:scale-90" />
            </button>
          ) : (
            <span />
          )}
          <Button variant="ghost" size="sm" onClick={() => file.current?.click()} disabled={saving}>
            {m["identity.from_file"]()}
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="self-center" onClick={() => setPhone(true)}>
          <HugeiconsIcon icon={SmartPhone01Icon} />
          {m["identity.use_phone"]()}
        </Button>
        </>
        )}
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const picked = event.target.files?.[0]
            event.target.value = ''
            if (picked) setStill(await readFile(picked))
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function AngleImage({ attachment, angle, className }: { attachment?: Attachment; angle: PersonPhotoAngle; className?: string }) {
  const { data: src } = useAttachmentDataUrl(attachment?.id)
  return (
    <div className={cn('flex items-center justify-center overflow-hidden bg-foreground/[0.04]', className)}>
      {src ? <img src={src} alt={labelOf(angle)} className="h-full w-full object-cover" /> : <PoseOutline angle={angle} className="w-3/4 text-muted-foreground/40" />}
    </div>
  )
}

/**
 * The photographs on screen, weighted the way they are used: the face large,
 * as Contacts shows a poster, and the side views and the back small beside
 * it. Missing views are quiet outlines; one button takes the photographs.
 */
export function IdentityPhotos({ personId, attachments }: { personId: string; attachments: Attachment[] }) {
  const [capture, setCapture] = useState<PersonPhotoAngle[] | null>(null)
  const [viewing, setViewing] = useState<PersonPhotoAngle | null>(null)
  const clear = useClearPersonPhoto(personId)
  const byAngle = new Map(attachments.filter((a) => a.photoAngle).map((a) => [a.photoAngle as PersonPhotoAngle, a]))
  const missing = ORDER.filter((a) => !byAngle.has(a))

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <button type="button" onClick={() => (byAngle.has('front') ? setViewing('front') : setCapture(['front']))} className="cursor-pointer">
          <AngleImage attachment={byAngle.get('front')} angle="front" className="aspect-[3/4] w-44 rounded-2xl ring-1 ring-border/70" />
        </button>
        <div className="flex gap-2">
          {(['right_profile', 'left_profile', 'back'] as const).map((angle) => (
            <button key={angle} type="button" onClick={() => (byAngle.has(angle) ? setViewing(angle) : setCapture([angle]))} className="flex cursor-pointer flex-col items-center gap-1">
              <AngleImage attachment={byAngle.get(angle)} angle={angle} className="aspect-[3/4] w-20 rounded-xl ring-1 ring-border/70" />
              <span className="text-xs text-muted-foreground">{labelOf(angle)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setCapture(missing.length > 0 ? missing : ORDER)}>
          <HugeiconsIcon icon={Camera01Icon} />
          {missing.length === ORDER.length ? m["identity.take_photos"]() : missing.length > 0 ? m["identity.take_missing"]({ count: missing.length }) : m["identity.retake_all"]()}
        </Button>
        {byAngle.size > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="icon-sm" variant="ghost" aria-label={m["files.more"]()}>
                  <HugeiconsIcon icon={MoreHorizontalIcon} />
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-56">
              {ORDER.map((angle) => (
                <DropdownMenuItem key={angle} onClick={() => setCapture([angle])}>
                  {m["identity.replace"]({ view: labelOf(angle).toLowerCase() })}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {ORDER.filter((a) => byAngle.has(a)).map((angle) => (
                <DropdownMenuItem key={angle} variant="destructive" onClick={() => clear.mutate(angle)}>
                  {m["people.remove_photo"]({ angle: labelOf(angle).toLowerCase() })}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {capture && <IdentityCapture personId={personId} open onOpenChange={(o) => !o && setCapture(null)} angles={capture} />}

      {viewing && (
        <Dialog open onOpenChange={(o) => !o && setViewing(null)}>
          <DialogContent className="flex w-[94vw] max-w-md flex-col gap-3 p-4 sm:max-w-md">
            <DialogTitle className="text-base">{labelOf(viewing)}</DialogTitle>
            <AngleImage attachment={byAngle.get(viewing)} angle={viewing} className="aspect-[3/4] w-full rounded-2xl" />
            <div className="flex justify-center gap-1.5">
              {ORDER.filter((a) => byAngle.has(a)).map((a) => (
                <button key={a} type="button" onClick={() => setViewing(a)} className={cn('cursor-pointer rounded-full px-2.5 py-1 text-xs', a === viewing ? 'bg-foreground text-background' : 'bg-foreground/5 text-muted-foreground')}>
                  {labelOf(a)}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  )
}
