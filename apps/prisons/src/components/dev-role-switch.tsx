import { HugeiconsIcon } from '@hugeicons/react'
import { CodeIcon } from '@hugeicons/core-free-icons'
import { cn } from '@pleadli/ui/lib/utils'
import { Switch } from '@pleadli/ui/switch'
import { useHqConfig, useSetDevRole } from '@/features/session'

/** Dev builds only (`import.meta.env.DEV`, on top of the underlying Tauri
 * command's own `#[cfg(debug_assertions)]` gate, so a release build never
 * ships this UI to hide). Lets one installation be tested as both a
 * Facility and Head Office without a second real activation code (spec:
 * docs/specs/prisons/0001-head-office-peer-sync-network/0001-onboarding-
 * and-activation-code.md, AC-6). Rendered both in the toolbar (quick
 * access while designing) and in Settings (`compact={false}`, with a
 * fuller explanation). */
export function DevRoleSwitch({ compact = true }: { compact?: boolean }) {
  const { data: hqConfig } = useHqConfig()
  const setDevRole = useSetDevRole()
  const isHeadOffice = hqConfig?.isHeadOffice ?? false

  if (compact) {
    return (
      <label
        className={cn(
          'flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 h-7 text-xs text-muted-foreground',
        )}
        title="Dev builds only: switch between Facility and Head Office"
      >
        <HugeiconsIcon icon={CodeIcon} size={13} />
        {isHeadOffice ? 'Head Office' : 'Facility'}
        <Switch
          checked={isHeadOffice}
          onCheckedChange={(checked) => setDevRole.mutate(checked)}
          disabled={setDevRole.isPending}
        />
      </label>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <HugeiconsIcon icon={CodeIcon} size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium">Dev role switch</span>
          <span className="text-xs text-muted-foreground">
            Dev builds only. Flips this installation between Facility and Head Office without a real activation code.
          </span>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        {isHeadOffice ? 'Head Office' : 'Facility'}
        <Switch checked={isHeadOffice} onCheckedChange={(checked) => setDevRole.mutate(checked)} disabled={setDevRole.isPending} />
      </label>
    </div>
  )
}
