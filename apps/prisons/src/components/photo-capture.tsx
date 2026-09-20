import { fileToDataUrl, videoFrameToDataUrl } from '@/lib/image'
import { Camera01Icon, Delete02Icon, RefreshIcon, Upload01Icon, UserIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { m } from '@/paraglide/messages'

type PhotoCaptureProps = {
  /** A JPEG data URL, or null when nothing has been taken yet. */
  value: string | null
  onChange: (dataUrl: string | null) => void
  label: string
  hint?: string
  /** Portrait suits a head-and-shoulders shot, landscape a document or scene. */
  shape?: 'portrait' | 'square' | 'landscape'
  className?: string
  /** Extra buttons next to Camera and Upload, for example "Phone link". */
  actions?: ReactNode
}

const shapeClass = { portrait: 'aspect-[3/4]', square: 'aspect-square', landscape: 'aspect-[4/3]' } as const

/**
 * One photo slot: take it with a connected or built-in camera, or upload a
 * file. The camera is optional by design, since a desktop webview may not be
 * allowed to open one; upload always works, and the parent can add its own
 * route in through `actions` (such as a link a phone opens to send the shot).
 */
export function PhotoCapture({ value, onChange, label, hint, shape = 'portrait', className, actions }: PhotoCaptureProps) {
  const [live, setLive] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const [message, setMessage] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setLive(false)
  }, [])

  useEffect(() => stop, [stop])

  const start = useCallback(
    async (wanted?: string) => {
      setMessage(null)
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage(m.ui_a_camera_cannot_be_opened_from())
        return
      }
      try {
        streamRef.current?.getTracks().forEach((track) => track.stop())
        const stream = await navigator.mediaDevices.getUserMedia({
          video: wanted ? { deviceId: { exact: wanted } } : { facingMode: 'user' },
          audio: false,
        })
        streamRef.current = stream
        setLive(true)
        const all = await navigator.mediaDevices.enumerateDevices()
        setDevices(all.filter((device) => device.kind === 'videoinput'))
        setDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? wanted ?? '')
      } catch {
        stop()
        setMessage(m.ui_no_camera_could_be_opened_check())
      }
    },
    [stop],
  )

  useEffect(() => {
    if (live && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      void videoRef.current.play().catch(() => undefined)
    }
  }, [live, deviceId])

  const snap = () => {
    if (!videoRef.current) return
    try {
      onChange(videoFrameToDataUrl(videoRef.current))
      stop()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : m.ui_could_not_take_the_photo())
    }
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setMessage(null)
    try {
      onChange(await fileToDataUrl(file))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : m.ui_could_not_read_that_image())
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        {hint && <span className="truncate text-[11px] text-muted-foreground">{hint}</span>}
      </div>

      <div className={cn('relative overflow-hidden rounded-lg border border-dashed border-border bg-muted/40', shapeClass[shape])}>
        {live ? (
          <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" />
        ) : value ? (
          <img src={value} alt={label} className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <HugeiconsIcon icon={UserIcon} size={28} />
            <span className="text-[11px]">{m.ui_no_photo_yet()}</span>
          </div>
        )}
      </div>

      {live && devices.length > 1 && (
        <select
          value={deviceId}
          onChange={(event) => {
            setDeviceId(event.target.value)
            void start(event.target.value)
          }}
          aria-label={m.ui_camera()}
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        >
          {devices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || m.ui_camera_2({ index: index + 1 })}
            </option>
          ))}
        </select>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {live ? (
          <>
            <Button type="button" size="xs" onClick={snap}>
              <HugeiconsIcon icon={Camera01Icon} size={12} /> {m.ui_take_photo()}
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={stop}>
              {m.ui_cancel()}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="xs" variant={value ? 'secondary' : 'default'} onClick={() => void start()}>
              <HugeiconsIcon icon={value ? RefreshIcon : Camera01Icon} size={12} /> {value ? m.ui_retake() : m.ui_camera()}
            </Button>
            <Button type="button" size="xs" variant="secondary" onClick={() => fileRef.current?.click()}>
              <HugeiconsIcon icon={Upload01Icon} size={12} /> {m.ui_upload()}
            </Button>
            {actions}
            {value && (
              <Button type="button" size="xs" variant="ghost" onClick={() => onChange(null)} aria-label={m.ui_remove({ label })}>
                <HugeiconsIcon icon={Delete02Icon} size={12} />
              </Button>
            )}
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void pickFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>

      {message && <p className="text-[11px] text-muted-foreground">{message}</p>}
    </div>
  )
}
