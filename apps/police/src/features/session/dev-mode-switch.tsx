import { CodeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { t } from '@pleadli/ui/goey-toaster'
import { Switch } from '@pleadli/ui/switch'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { setDevMode } from './data'
import { useInstallation } from './queries'

/** Dev builds only (`import.meta.env.DEV`, and the route it calls is compiled
 * out of release builds). Flips this installation between a Station and a
 * Command so both can be tried without a second machine. The window reloads
 * afterwards: what a Station showed is not what a Command shows, so nothing
 * from before is kept. */
export function DevModeSwitch({ compact = false }: { compact?: boolean }) {
  const { data: installation } = useInstallation()
  const flip = useMutation({
    mutationFn: setDevMode,
    onSuccess: () => window.location.assign('/'),
    onError: (error) => t.error('Could not switch', { description: error instanceof ApiError ? error.message : 'The switch did not go through.' }),
  })

  if (!installation?.installed) return null
  const command = installation.mode === 'command'
  const toggle = (checked: boolean) => flip.mutate(checked ? 'command' : 'station')

  if (!compact) {
    return (
      <label className="flex shrink-0 items-center gap-2">
        {command ? 'Command' : 'Station'}
        <Switch checked={command} onCheckedChange={toggle} disabled={flip.isPending} />
      </label>
    )
  }

  return (
    <label className={cn('flex h-6 items-center gap-1.5 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground')} title="Dev builds only: switch between Station and Command">
      <HugeiconsIcon icon={CodeIcon} size={13} />
      {command ? 'Command' : 'Station'}
      <Switch checked={command} onCheckedChange={toggle} disabled={flip.isPending} />
    </label>
  )
}
