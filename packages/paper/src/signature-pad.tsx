import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useEffect, useRef, useState } from 'react'

type Point = { x: number; y: number; w: number }

/**
 * Sign with a pen, a finger or a mouse, as on paper. Pen pressure sets the
 * weight of the line. The result is a PNG of the ink alone, on a transparent
 * ground, cropped to the signature, so it sits on any page.
 */
export function SignaturePad({
  onDone,
  onCancel,
  labels = { hint: 'Sign here with a pen, a finger or the mouse', clear: 'Clear', done: 'Use this signature', cancel: 'Cancel' },
  className,
}: {
  onDone: (png: string) => void
  onCancel?: () => void
  labels?: { hint: string; clear: string; done: string; cancel: string }
  className?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Point[][]>([])
  const drawing = useRef<Point[] | null>(null)
  const [empty, setEmpty] = useState(true)

  // A sharp line on high-density screens: the canvas is sized in device pixels.
  useEffect(() => {
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
  }, [])

  function redraw() {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const ratio = window.devicePixelRatio || 1
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.strokeStyle = '#0b1f4d'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokes.current) {
      if (stroke.length === 1) {
        ctx.beginPath()
        ctx.arc(stroke[0].x, stroke[0].y, stroke[0].w / 2, 0, Math.PI * 2)
        ctx.fillStyle = '#0b1f4d'
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

  function crop(): string | null {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return null
    const { width, height } = el
    const data = ctx.getImageData(0, 0, width, height).data
    let minX = width, minY = height, maxX = -1, maxY = -1
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[(y * width + x) * 4 + 3] > 0) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
    if (maxX < 0) return null
    const pad = 8
    const out = document.createElement('canvas')
    out.width = maxX - minX + pad * 2
    out.height = maxY - minY + pad * 2
    out.getContext('2d')!.drawImage(el, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
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
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {labels.cancel}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={empty}
          onClick={() => {
            strokes.current = []
            setEmpty(true)
            redraw()
          }}
        >
          {labels.clear}
        </Button>
        <Button
          size="sm"
          disabled={empty}
          onClick={() => {
            const png = crop()
            if (png) onDone(png)
          }}
        >
          {labels.done}
        </Button>
      </div>
    </div>
  )
}
