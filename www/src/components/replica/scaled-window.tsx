import { cn } from '@pleadli/ui/lib/utils'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import '@/styles/replica.css'

export const WINDOW_W = 1280
export const WINDOW_H = 860

/** The part of the window to show, in the window's own 1280 x 860 pixels. */
export type Region = { x: number; y: number; w: number; h: number }
const WHOLE: Region = { x: 0, y: 0, w: WINDOW_W, h: WINDOW_H }

/** A desktop app drawn at its real window size (1280 x 860) and scaled to fit, so it is the same
 * layout a person sees on a laptop, never stretched or reflowed. A region shows only part of it.
 * The corner follows the size it is shown at: a small window gets a small corner, never a pill. */
export function ScaledWindow({ children, className, accent, region = WHOLE }: { children: ReactNode; className?: string; accent?: Record<string, string>; region?: Region }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(560)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setWidth(el.clientWidth)
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const scale = width / region.w
  const radius = Math.min(8, Math.max(2, Math.round(width * 0.009)))
  return (
    <div
      ref={box}
      className={cn('relative w-full overflow-hidden bg-background shadow-[0_1px_2px_#0000000d,0_12px_30px_-18px_#00000047] ring-1 ring-black/10', className)}
      style={{ aspectRatio: `${region.w} / ${region.h}`, borderRadius: radius }}
    >
      <div
        className="replica absolute top-0 left-0 origin-top-left select-none"
        style={{ width: WINDOW_W, height: WINDOW_H, transform: `translate(${-region.x * scale}px, ${-region.y * scale}px) scale(${scale})`, ...accent }}
      >
        {children}
      </div>
    </div>
  )
}
