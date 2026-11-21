import * as m from '@/paraglide/messages'
import { SettingsCard, SettingsRow } from '@/components/settings-card'
import { useMe } from '@/features/session'
import { ApiError } from '@/lib/api'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useRef, useState } from 'react'
import { useImportRules, useRules } from './queries'
import { RuleEditor } from './rule-editor'
import type { Rule } from './schema'

const statusLabel = (status: string) =>
  status === 'reviewed' ? m["rules.status_reviewed"]() : status === 'sourced' ? m["rules.status_sourced"]() : m["rules.status_draft"]()

/** The legal rules the app applies, each with where it comes from and whether anyone has checked it,
 * and a way for an administrator to load an improved pack. */
export function RulesPane() {
  const { data: pack } = useRules()
  const { data: me } = useMe()
  const importRules = useImportRules()
  const picker = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<Rule | null>(null)
  if (!pack) return null
  const awaiting = pack.rules.filter((rule) => rule.status === 'draft').length

  const load = async (file: File | undefined) => {
    if (!file) return
    try {
      const loaded = await importRules.mutateAsync(await file.text())
      t.success(m["rules.loaded"](), { description: m["rules.loaded_detail"]({ name: loaded.name, version: loaded.version }) })
    } catch (error) {
      t.error(m["rules.load_failed"](), { description: error instanceof ApiError ? error.message : m["common.try_again"]() })
    } finally {
      if (picker.current) picker.current.value = ''
    }
  }

  return (
    <>
      <SettingsCard hint={m["rules.about_pack"]()}>
        <SettingsRow label={`${pack.name} · ${m["rules.version"]({ version: pack.version })}`} hint={m["rules.updated"]({ date: pack.updatedOn })}>
          <span className="text-muted-foreground">{awaiting > 0 ? m["rules.awaiting"]({ count: awaiting }) : m["rules.all_checked"]()}</span>
        </SettingsRow>
        {me?.role === 'admin' && (
          <SettingsRow label={m["rules.load_label"]()} hint={m["rules.load_hint"]()}>
            <input ref={picker} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void load(e.target.files?.[0])} />
            <Button variant="secondary" disabled={importRules.isPending} onClick={() => picker.current?.click()}>
              {m["rules.load_button"]()}
            </Button>
          </SettingsRow>
        )}
      </SettingsCard>

      <SettingsCard>
        {pack.rules.map((rule) => (
          <SettingsRow
            key={rule.id}
            label={rule.title}
            hint={[rule.citation ?? m["rules.no_citation"](), rule.status === 'reviewed' && rule.reviewedBy ? m["rules.reviewed_by"]({ name: rule.reviewedBy, date: rule.reviewedOn ?? '' }) : null, rule.note]
              .filter(Boolean)
              .join(' · ')}
          >
            <div className="flex items-center gap-2">
              <Badge variant={rule.status === 'draft' ? 'outline' : 'secondary'}>{statusLabel(rule.status)}</Badge>
              {me?.role === 'admin' && (
                <Button variant="secondary" size="sm" onClick={() => setEditing(rule)}>
                  {m["rules.edit_button"]()}
                </Button>
              )}
            </div>
          </SettingsRow>
        ))}
      </SettingsCard>
      {editing && <RuleEditor key={`${editing.id}-${pack.version}`} rule={editing} open onOpenChange={(open) => !open && setEditing(null)} />}
    </>
  )
}
