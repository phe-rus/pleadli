import { HugeiconsIcon } from '@hugeicons/react'
import { CodeIcon } from '@hugeicons/core-free-icons'
import { cn } from '@pleadli/ui/lib/utils'
import { Switch } from '@pleadli/ui/switch'
import { useHqConfig, useSetDevRole } from '@/features/session'
import { m } from '@/paraglide/messages'

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
          // h-6 matches the theme select beside it (`size="sm"`).
          'flex h-6 items-center gap-1.5 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground',
        )}
        title={m.ui_dev_builds_only_switch_between_facility()}
      >
        <HugeiconsIcon icon={CodeIcon} size={13} />
        {isHeadOffice ? m.ui_head_office() : m.ui_facility()}
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
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <HugeiconsIcon icon={CodeIcon} size={16} />
        </div>
        <div className="flex min-w-0 flex-col">
          <h4>{m.ui_dev_role_switch()}</h4>
          <p>{m.ui_dev_builds_only_flips_this_installation()}</p>
        </div>
      </div>
      <label className="flex shrink-0 items-center gap-2">
        {isHeadOffice ? m.ui_head_office() : m.ui_facility()}
        <Switch checked={isHeadOffice} onCheckedChange={(checked) => setDevRole.mutate(checked)} disabled={setDevRole.isPending} />
      </label>
    </div>
  )
}
