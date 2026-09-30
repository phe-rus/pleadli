import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { useActor } from '@/features/installation'
import { formatDay } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { Switch } from '@pleadli/ui/switch'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { listModels, type AssistSettingsChange, type Provider } from './data'
import { useAssistSettings, useSaveAssistSettings } from './queries'

const providers: { id: Provider; label: () => string; about: () => string; keyUrl?: string }[] = [
  { id: 'gemini', label: () => 'Google Gemini', about: m["assist.provider.gemini"], keyUrl: 'aistudio.google.com/apikey' },
  { id: 'openrouter', label: () => 'OpenRouter', about: m["assist.provider.openrouter"], keyUrl: 'openrouter.ai/keys' },
  { id: 'anthropic', label: () => 'Anthropic Claude', about: m["assist.provider.anthropic"], keyUrl: 'console.anthropic.com' },
  { id: 'openai_compatible', label: m["assist.provider.other_label"], about: m["assist.provider.other"] },
]

/** Settings > Assist (ported from DPP). Off until an administrator turns it on
 * and confirms that a matter's papers go to the provider. The model is chosen
 * from the provider's own list unless someone fixes one. Keys never come back. */
export function AssistPane() {
  const isAdmin = useActor()?.isAdmin === true
  const { data: s } = useAssistSettings()
  const save = useSaveAssistSettings()
  const [key, setKey] = useState('')
  const [baseUrl, setBaseUrl] = useState<string | null>(null)
  const [agree, setAgree] = useState(false)
  const [showModels, setShowModels] = useState(false)
  const models = useQuery({ queryKey: ['assist', 'models', s?.provider, s?.keyHint], queryFn: listModels, enabled: showModels && Boolean(s?.ready), staleTime: 10 * 60_000 })
  if (!s) return null
  const on = s.mode !== 'off'

  const apply = (change: AssistSettingsChange, done?: string) =>
    save.mutate(change, {
      onSuccess: () => done && t.success(done),
      onError: (e) => t.error(m["settings.save_failed"](), { description: e.message }),
    })

  return (
    <>
      <SettingsCard
        title={m["assist.settings.title"]()}
        badge={<Tag tone={s.ready ? 'done' : on ? 'open' : 'neutral'}>{s.ready ? m["assist.settings.ready"]() : on ? m["assist.settings.needs"]() : m["assist.settings.off"]()}</Tag>}
        description={m["assist.settings.description"]()}
        hint={isAdmin ? undefined : m["settings.admin_only"]()}
      >
        <label className="flex items-center justify-between gap-4">
          <span>{m["assist.settings.use"]()}</span>
          <Switch
            checked={on}
            disabled={!isAdmin || save.isPending}
            onCheckedChange={(checked) => apply({ mode: checked ? 'practice_key' : 'off' }, checked ? m["assist.settings.turned_on"]() : m["assist.settings.turned_off"]())}
          />
        </label>
      </SettingsCard>

      {on && (
        <SettingsCard
          title={m["assist.settings.where_title"]()}
          badge={s.acknowledgedAt ? <Tag tone="done">{m["assist.settings.confirmed"]()}</Tag> : <Tag tone="urgent">{m["assist.settings.not_confirmed"]()}</Tag>}
          description={m["assist.settings.where_body"]()}
          hint={s.acknowledgedAt ? m["assist.settings.confirmed_by"]({ name: s.acknowledgedBy ?? '', date: formatDay(s.acknowledgedAt) }) : undefined}
          action={
            !s.acknowledgedAt &&
            isAdmin && (
              <Button size="sm" disabled={!agree || save.isPending} onClick={() => apply({ mode: 'practice_key', acknowledge: true }, m["assist.settings.turned_on"]())}>
                {m["assist.settings.confirm"]()}
              </Button>
            )
          }
        >
          <ul className="flex flex-col gap-1 pl-4 text-muted-foreground">
            <li>{m["assist.settings.point_sent_any"]()}</li>
            <li>{m["assist.settings.point_free"]()}</li>
            <li>{m["assist.settings.point_logged"]()}</li>
            <li>{m["assist.settings.point_decide"]()}</li>
          </ul>
          {!s.acknowledgedAt && isAdmin && (
            <label className="flex items-start gap-2">
              <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
              <span>{m["assist.settings.agree"]()}</span>
            </label>
          )}
        </SettingsCard>
      )}

      {on && (
        <SettingsCard
          title={m["assist.settings.provider_title"]()}
          badge={
            s.keySource ? (
              <Tag tone="done">{s.keySource === 'environment' ? m["assist.settings.key_env"]({ hint: s.keyHint ?? '' }) : m["assist.settings.key_set"]({ hint: s.keyHint ?? '' })}</Tag>
            ) : (
              <Tag tone="urgent">{m["assist.settings.key_missing"]()}</Tag>
            )
          }
          description={m["assist.settings.provider_body"]()}
          onSubmit={(e) => {
            e.preventDefault()
            apply({ mode: 'practice_key', apiKey: key.trim() || undefined, baseUrl: baseUrl ?? undefined }, m["settings.saved"]())
            setKey('')
          }}
          action={
            isAdmin && (
              <Button type="submit" size="sm" disabled={save.isPending || (!key.trim() && baseUrl === null)}>
                {m["settings.save"]()}
              </Button>
            )
          }
        >
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={s.provider === p.id}
                disabled={!isAdmin}
                onClick={() => p.id !== s.provider && apply({ mode: 'practice_key', provider: p.id, autoModel: true }, m["assist.settings.provider_changed"]({ name: p.label() }))}
                className={cn('flex cursor-pointer flex-col gap-0.5 rounded-xl p-3 text-left ring-1 transition-colors', s.provider === p.id ? 'bg-primary/5 ring-primary' : 'ring-border hover:bg-secondary/50')}
              >
                <strong>{p.label()}</strong>
                <span className="text-muted-foreground">{p.about()}</span>
              </button>
            ))}
          </div>
          {s.provider === 'openai_compatible' && (
            <label className="flex flex-col gap-1.5">
              <span>{m["assist.settings.base_url"]()}</span>
              <Input value={baseUrl ?? s.baseUrl ?? ''} disabled={!isAdmin} placeholder="http://localhost:11434/v1" onChange={(e) => setBaseUrl(e.target.value)} />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span>{m["assist.settings.key"]()}</span>
            <Input type="password" autoComplete="off" value={key} disabled={!isAdmin} placeholder={s.keyHint ?? m["assist.settings.key_placeholder"]()} onChange={(e) => setKey(e.target.value)} />
            {providers.find((p) => p.id === s.provider)?.keyUrl && (
              <span className="text-muted-foreground">{m["assist.settings.key_where"]({ url: providers.find((p) => p.id === s.provider)!.keyUrl! })}</span>
            )}
          </label>
          {s.keySource === 'settings' && isAdmin && (
            <Button type="button" size="sm" variant="ghost" className="w-fit text-destructive" onClick={() => apply({ mode: 'practice_key', apiKey: '' }, m["assist.settings.key_removed"]())}>
              {m["assist.settings.remove_key"]()}
            </Button>
          )}
        </SettingsCard>
      )}

      {on && (
        <SettingsCard title={m["assist.settings.model_title"]()} description={m["assist.settings.model_body"]()}>
          <label className="flex items-center justify-between gap-4">
            <span>{m["assist.settings.auto_model"]()}</span>
            <Switch checked={s.autoModel} disabled={!isAdmin} onCheckedChange={(v) => apply({ mode: 'practice_key', autoModel: v })} />
          </label>
          {!showModels ? (
            <Button type="button" size="sm" variant="secondary" className="w-fit" disabled={!s.ready} onClick={() => setShowModels(true)}>
              {m["assist.settings.show_models"]()}
            </Button>
          ) : models.isLoading ? (
            <p className="text-muted-foreground">{m["assist.settings.loading_models"]()}</p>
          ) : models.isError ? (
            <p className="not-typeset text-destructive">{models.error.message}</p>
          ) : (
            <ul className="flex max-h-72 list-none flex-col gap-0.5 overflow-y-auto p-0">
              {[...(models.data ?? [])]
                .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
                .map((x) => {
                  const chosen = !s.autoModel && s.model === x.id
                  return (
                    <li key={x.id}>
                      <button
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => apply({ mode: 'practice_key', model: x.id, autoModel: false }, m["assist.settings.model_fixed"]({ model: x.label }))}
                        className={cn('flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-secondary/60', chosen && 'bg-primary/5 ring-1 ring-primary/40')}
                      >
                        <span className="min-w-0 truncate">{x.label}</span>
                        {x.rank && s.autoModel ? (
                          <span className="shrink-0 text-primary">{x.rank === 1 ? m["assist.settings.auto_first"]() : m["assist.settings.auto_backup"]({ n: x.rank })}</span>
                        ) : chosen ? (
                          <span className="shrink-0 text-primary">{m["assist.settings.in_use"]()}</span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
            </ul>
          )}
        </SettingsCard>
      )}
    </>
  )
}
