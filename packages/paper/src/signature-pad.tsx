import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useEffect, useRef, useState } from 'react'

type Mode = 'draw' | 'type' | 'image'
type Labels = {
  hint: string
  clear: string
  done: string
  cancel: string
  draw?: string
  type?: string
  image?: string
  typeHint?: string
  choose?: string
  imageHint?: string
}
type Point = { x: number; y: number; w: number }

const INK = '#0b1f4d'
const SCRIPT = '"Segoe Script", "Snell Roundhand", "Brush Script MT", "Lucida Handwriting", cursive'

/** Crops a canvas to its visible ink (with a small margin) and returns a PNG on a transparent ground. */
function trim(el: HTMLCanvasElement): string | null {
  const ctx = el.getContext('2d')
  if (!ctx) return null
  const { width, height } = el
  const data = ctx.getImageData(0, 0, width, height).data
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
  if (maxX < 0) return null
  const pad = 8
  const out = document.createElement('canvas')
  out.width = maxX - minX + 1 + pad * 2
  out.height = maxY - minY + 1 + pad * 2
  out.getContext('2d')!.drawImage(el, minX, minY, maxX - minX + 1, maxY - minY + 1, pad, pad, maxX - minX + 1, maxY - minY + 1)
  return out.toDataURL('image/png')
}

/** Types the name in a handwriting face, ink on transparent. */
function typedSignature(text: string): string | null {
  const value = text.trim()
  if (!value) return null
  const size = 96
  const el = document.createElement('canvas')
  const ctx = el.getContext('2d')!
  ctx.font = `italic ${size}px ${SCRIPT}`
  el.width = Math.ceil(ctx.measureText(value).width) + size
  el.height = size * 2
  ctx.font = `italic ${size}px ${SCRIPT}`
  ctx.fillStyle = INK
  ctx.textBaseline = 'middle'
  ctx.fillText(value, size / 2, size)
  return trim(el)
}

/** An existing picture of a signature (a scan or a photo of one on white paper):
 * the paper becomes transparent and the ink is kept, so it sits on any page. */
async function imageSignature(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('This file is not a readable image.'))
      i.src = url
    })
    const scale = Math.min(1, 900 / Math.max(img.width, img.height))
    const el = document.createElement('canvas')
    el.width = Math.max(1, Math.round(img.width * scale))
    el.height = Math.max(1, Math.round(img.height * scale))
    const ctx = el.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, el.width, el.height)
    const frame = ctx.getImageData(0, 0, el.width, el.height)
    const px = frame.data
    for (let i = 0; i < px.length; i += 4) {
      // Brightness decides how much of the pixel is ink; a pixel that is already transparent stays so.
      const light = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255
      const ink = Math.max(0, Math.min(1, (0.82 - light) / 0.5))
      px[i] = 11
      px[i + 1] = 31
      px[i + 2] = 77
      px[i + 3] = Math.round(ink * px[i + 3])
    }
    ctx.putImageData(frame, 0, 0)
    const png = trim(el)
    if (!png) throw new Error('No signature could be seen in this picture.')
    return png
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Sign three ways, as a person would on paper: draw with a pen, a finger or a
 * mouse (pen pressure sets the weight of the line), type the name in a
 * handwriting face, or bring a picture of an existing signature. The result is
 * always a PNG of the ink alone, on a transparent ground, cropped to the
 * signature, so it sits on any page.
 */
export function SignaturePad({
  onDone,
  onCancel,
  name,
  labels = { hint: 'Sign here with a pen, a finger or the mouse', clear: 'Clear', done: 'Use this signature', cancel: 'Cancel' },
  className,
}: {
  onDone: (png: string) => void
  onCancel?: () => void
  /** Pre-fills the typed signature, usually the signer's own name. */
  name?: string
  labels?: Labels
  className?: string
}) {
  const l = {
    draw: 'Draw',
    type: 'Type',
    image: 'Picture',
    typeHint: 'Type the name to sign',
    choose: 'Choose a picture',
    imageHint: 'A scan or a photo of a signature on white paper',
    ...labels,
  }
  // A touch screen or pen opens on drawing; a desktop with a mouse still can, but typing is the quicker start.
  const [mode, setMode] = useState<Mode>('draw')
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Point[][]>([])
  const drawing = useRef<Point[] | null>(null)
  const [empty, setEmpty] = useState(true)
  const [typed, setTyped] = useState(name ?? '')
  const [picture, setPicture] = useState<{ png: string } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  // A sharp line on high-density screens: the canvas is sized in device pixels.
  useEffect(() => {
    if (mode !== 'draw') return
    const el = canvas.current
    if (!el) return
    const fit = () => {
      const ratio = window.devicePixelRatio || 1
      const { width, height } = el.getBoundingClientRect()
      el.width = Math.round(width * ratio)
      el.height = Math.round(height * ratio)
      redraw()
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [mode])

  function redraw() {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const ratio = window.devicePixelRatio || 1
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.strokeStyle = INK
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokes.current) {
      if (stroke.length === 1) {
        ctx.beginPath()
        ctx.arc(stroke[0].x, stroke[0].y, stroke[0].w / 2, 0, Math.PI * 2)
        ctx.fillStyle = INK
        ctx.fill()
      }
      for (let i = 1; i < stroke.length; i++) {
        const a = stroke[i - 1]
        const b = stroke[i]
        ctx.beginPath()
        ctx.lineWidth = (a.w + b.w) / 2
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
  }

  function point(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const r = e.currentTarget.getBoundingClientRect()
    // Pens report pressure; fingers and mice report 0 or 0.5.
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: 1.2 + pressure * 2.6 }
  }

  const ready = mode === 'draw' ? !empty : mode === 'type' ? typed.trim().length > 0 : picture != null

  function finish() {
    const png = mode === 'draw' ? (canvas.current ? trim(canvas.current) : null) : mode === 'type' ? typedSignature(typed) : (picture?.png ?? null)
    if (png) onDone(png)
  }

  function clear() {
    if (mode === 'draw') {
      strokes.current = []
      setEmpty(true)
      redraw()
    } else if (mode === 'type') setTyped('')
    else {
      setPicture(null)
      setProblem(null)
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div role="tablist" className="flex gap-1 self-start rounded-lg bg-foreground/[0.05] p-0.5">
        {(['draw', 'type', 'image'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cn('rounded-md px-3 py-1 text-sm', mode === id ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground')}
          >
            {l[id]}
          </button>
        ))}
      </div>

      {mode === 'draw' && (
        <div className="relative">
          <canvas
            ref={canvas}
            aria-label={labels.hint}
            className="h-44 w-full cursor-crosshair touch-none rounded-xl bg-white ring-1 ring-border"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drawing.current = [point(e)]
              strokes.current.push(drawing.current)
              setEmpty(false)
              redraw()
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return
              // Coalesced events keep a fast stroke smooth on pens and touch screens.
              const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
              const r = e.currentTarget.getBoundingClientRect()
              for (const ev of events) {
                const pressure = ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5
                drawing.current.push({ x: ev.clientX - r.left, y: ev.clientY - r.top, w: 1.2 + pressure * 2.6 })
              }
              redraw()
            }}
            onPointerUp={() => (drawing.current = null)}
            onPointerCancel={() => (drawing.current = null)}
          />
          <span className="pointer-events-none absolute inset-x-8 bottom-10 border-b border-dashed border-zinc-300" />
          {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400">{labels.hint}</span>}
        </div>
      )}

      {mode === 'type' && (
        <div className="flex h-44 flex-col justify-between rounded-xl bg-white p-3 ring-1 ring-border">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={l.typeHint}
            aria-label={l.typeHint}
            autoFocus
            className="w-full rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
          />
          <div className="flex flex-1 items-center justify-center overflow-hidden px-2">
            <span className="max-w-full truncate text-5xl italic" style={{ fontFamily: SCRIPT, color: INK }}>
              {typed}
            </span>
          </div>
          <span className="mx-5 border-b border-dashed border-zinc-300" />
        </div>
      )}

      {mode === 'image' && (
        <label
          className="flex h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl bg-white text-sm text-zinc-500 ring-1 ring-border"
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (!file) return
            try {
              setProblem(null)
              setPicture({ png: await imageSignature(file) })
            } catch (error) {
              setProblem((error as Error).message)
            }
          }}
        >
          {picture ? <img src={picture.png} alt="" className="max-h-32 max-w-[80%] object-contain" /> : <span className="font-medium text-zinc-700">{l.choose}</span>}
          {!picture && <span>{l.imageHint}</span>}
          {problem && <span className="text-destructive">{problem}</span>}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              try {
                setProblem(null)
                setPicture({ png: await imageSignature(file) })
              } catch (error) {
                setProblem((error as Error).message)
              }
            }}
          />
        </label>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {labels.cancel}
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={!ready} onClick={clear}>
          {labels.clear}
        </Button>
        <Button size="sm" disabled={!ready} onClick={finish}>
          {labels.done}
        </Button>
      </div>
    </div>
  )
}
