import { PoliceBadgeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { cn } from '@pleadli/ui/lib/utils'

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), 1800)
    const done = setTimeout(onDone, 2400)
    return () => {
      clearTimeout(t)
      clearTimeout(done)
    }
  }, [onDone])

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background',
        'transition-opacity duration-500',
        leaving && 'opacity-0',
      )}
    >
      <div className="p-4">
        <HugeiconsIcon icon={PoliceBadgeIcon} className="text-primary" size={56} strokeWidth={1.5} />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-lg font-semibold">Pleadli Police</p>
        <p className="text-sm text-muted-foreground">Loading your station…</p>
      </div>
    </div>
  )
}