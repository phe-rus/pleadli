import { useRef, useState, type PointerEvent } from 'react'

/** Handwriting kept with a paper: strokes in a 1000-wide box whose height
 * follows the page, so it lands in the same place at any size on screen or
 * printed. Stored as a JSON string. */
export type Ink = { w: number; h: number; strokes: { d: string; width: number }[] }

export function parseInk(value: string | null | undefined): Ink | null {
  if (!value) return null
  try {
    const ink = JSON.parse(value) as Ink
    return Array.isArray(ink.strokes) ? ink : null
  } catch {
    return null
  }
}

const W = 1000

/**
 * A clear layer over a paper that takes writing from a pen, a finger or the
 * mouse while `active`, and shows it at all times (on screen and when
 * printed). A pen's pressure sets how thick the line is. Place it inside the
 * sheet, which must be `relative`.
 */
export function InkLayer({ value, active, onChange }: { value: string | null | undefined; active: boolean; onChange: (value: string | null) => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const ink = parseInk(value)
  const [live, setLive] = useState<{ points: [number, number][]; pressure: number[] } | null>(null)

  const box = () => {
    const r = svg.current!.getBoundingClientRect()
    return { r, h: Math.round((r.height / r.width) * W) }
  }
  const at = (e: PointerEvent): [number, number] => {
    const { r } = box()
    return [Math.round(((e.clientX - r.left) / r.width) * W * 10) / 10, Math.round(((e.clientY - r.top) / r.width) * W * 10) / 10]
  }
  const path = (points: [number, number][]) =>
    points.length === 1 ? `M${points[0][0]} ${points[0][1]}l0.1 0` : `M${points.map((p) => `${p[0]} ${p[1]}`).join('L')}`

  const finish = () => {
    if (!live) return
    const avg = live.pressure.reduce((a, b) => a + b, 0) / Math.max(1, live.pressure.length)
    const { h } = box()
    const next: Ink = { w: W, h: ink?.h ?? h, strokes: [...(ink?.strokes ?? []), { d: path(live.points), width: Math.round((1.4 + avg * 2.4) * 10) / 10 }] }
    onChange(JSON.stringify(next))
    setLive(null)
  }

  const height = ink?.h ?? 1414
  return (
    <svg
      ref={svg}
      data-ink
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="xMinYMin meet"
      className="absolute inset-0 z-10 h-full w-full"
      style={{ pointerEvents: active ? 'auto' : 'none', touchAction: active ? 'none' : 'auto', cursor: active ? 'crosshair' : undefined }}
      onPointerDown={(e) => {
        if (!active) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setLive({ points: [at(e)], pressure: [e.pressure || 0.5] })
      }}
      onPointerMove={(e) => {
        if (!live) return
        setLive({ points: [...live.points, at(e)], pressure: [...live.pressure, e.pressure || 0.5] })
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {ink?.strokes.map((s, i) => (
        <path key={i} d={s.d} fill="none" stroke="#1a237e" strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {live && <path d={path(live.points)} fill="none" stroke="#1a237e" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}
