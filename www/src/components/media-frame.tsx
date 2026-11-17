import { cn } from '@pleadli/ui/lib/utils'
import { useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

export interface Media {
  kind: 'image' | 'video'
  src: string
  alt: string
  /** Still shown while a video loads, and instead of it for visitors who ask for less motion. */
  poster?: string
  width?: number
  height?: number
}

/** The slot every screenshot, recording or looping clip goes into. Give it `media`
 * and it shows that; leave it out and it shows `fallback` (the drawn window), so the
 * page is complete today and gets better the moment real captures are added.
 * Videos are muted, inline and looping, which is what iOS Safari needs to autoplay. */
export function MediaFrame({ media, fallback, className }: { media?: Media; fallback: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  if (!media) return <div className={className}>{fallback}</div>
  const frame = cn(
    'block h-auto w-full overflow-hidden rounded-2xl border border-border/70',
    'bg-card shadow-[0_32px_80px_-32px_rgba(0,0,0,0.38)]',
  )
  return (
    <div className={className}>
      {media.kind === 'video' && !reduce ? (
        <video
          className={frame}
          src={media.src}
          poster={media.poster}
          width={media.width}
          height={media.height}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={media.alt}
        />
      ) : (
        <img
          className={frame}
          src={media.kind === 'video' ? (media.poster ?? media.src) : media.src}
          alt={media.alt}
          width={media.width}
          height={media.height}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  )
}
