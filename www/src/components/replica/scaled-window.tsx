import { cn } from '@pleadli/ui/lib/utils'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import '@/styles/replica.css'

export const WINDOW_W = 1280
export const WINDOW_H = 860

/** A desktop app drawn at its real window size (1280 x 860) and scaled to fit, so it
 * is the same layout a person sees on a laptop, never stretched or reflowed. */
export function ScaledWindow({ children, className, accent }: { children: ReactNode; className?: string; accent?: Record<string, string> }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setScale(el.clientWidth / WINDOW_W)
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={box}
      className={cn('relative w-full overflow-hidden rounded-xl shadow-[0_40px_80px_-34px_#0008,0_6px_18px_-8px_#0004] ring-1 ring-black/20', className)}
      style={{ aspectRatio: `${WINDOW_W} / ${WINDOW_H}` }}
    >
      <div
        className="replica absolute top-0 left-0 origin-top-left select-none"
        style={{ width: WINDOW_W, height: WINDOW_H, transform: `scale(${scale})`, ...accent }}
      >
        {children}
      </div>
    </div>
  )
}
