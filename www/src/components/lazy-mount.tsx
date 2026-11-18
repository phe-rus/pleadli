import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Holds its place at a fixed shape and only builds what is inside while it is near the screen.
 * Far away it lets go of it again, so a long page never carries every window at once. */
export function LazyMount({ children, aspect, margin = '240px', className }: { children: ReactNode; aspect: string; margin?: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') return setNear(true)
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: margin })
    observer.observe(el)
    return () => observer.disconnect()
  }, [margin])
  return (
    <div ref={box} className={className} style={{ aspectRatio: aspect }}>
      {near ? children : <div className="size-full rounded-[4px] bg-muted/70" />}
    </div>
  )
}
