import { SettingsCard, SettingsRow } from '@/components/settings-card'
import { useActor } from '@/features/installation'
import { formatDay } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Switch } from '@pleadli/ui/switch'
import { useState } from 'react'
import type { AssistSettingsChange, Provider } from './data'
import { isLocal, LOCAL_BASE_URL, LocalModel } from './local-model'
import { useAssistSettings, useSaveAssistSettings } from './queries'

const providers: { id: Provider; label: () => string; about: () => string; keyUrl?: string }[] = [
  { id: 'anthropic', label: () => 'Anthropic Claude', about: m["assist.provider.anthropic"], keyUrl: 'console.anthropic.com' },
  { id: 'gemini', label: () => 'Google Gemini', about: m["assist.provider.gemini"], keyUrl: 'aistudio.google.com/apikey' },
  { id: 'openrouter', label: () => 'OpenRouter', about: m["assist.provider.openrouter"], keyUrl: 'openrouter.ai/keys' },
  { id: 'openai_compatible', label: m["assist.provider.other_label"], about: m["assist.provider.other"] },
]

/** Settings > Assist, kept to what a practice decides once: whether to use it,
 * whose service it uses with which key, and that papers may go there. Which
 * model answers is chosen in Assist itself, by whoever is asking. Keys are
 * kept locked on this computer and never come back. */
export function AssistPane() {
  const isAdmin = useActor()?.isAdmin === true
  const { data: s } = useAssistSettings()
  const save = useSaveAssistSettings()
  const [key, setKey] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [baseUrl, setBaseUrl] = useState<string | null>(null)
  if (!s) return null
  const on = s.mode !== 'off'
  // "On this computer" is the own-server provider pointed at Ollama on this machine.
  const local = s.provider === 'openai_compatible' && isLocal(s.baseUrl)
  const provider = providers.find((p) => p.id === s.provider) ?? providers[0]
  const serviceName = local ? m["assist.local.service"]() : provider.label()
  const items = [{ value: 'local', label: m["assist.local.service"]() }, ...providers.map((p) => ({ value: p.id as string, label: p.label() }))]

  const apply = (change: AssistSettingsChange, done?: string) =>
    save.mutate(change, {
      onSuccess: () => done && t.success(done),
      onError: (e) => t.error(m["settings.save_failed"](), { description: e.message }),
    })
  const saveKey = () => {
    apply({ mode: 'practice_key', apiKey: key.trim() }, m["settings.saved"]())
    setKey('')
    setEditingKey(false)
  }

  return (
    <>
      <SettingsCard hint={isAdmin ? m["assist.settings.description"]() : m["settings.admin_only"]()}>
        <SettingsRow label={m["assist.settings.use"]()}>
          <Switch
            checked={on}
            disabled={!isAdmin || save.isPending}
            aria-label={m["assist.settings.use"]()}
            onCheckedChange={(checked) => apply({ mode: checked ? 'practice_key' : 'off' }, checked ? m["assist.settings.turned_on"]() : m["assist.settings.turned_off"]())}
          />
        </SettingsRow>
      </SettingsCard>

      {on && (
        <SettingsCard title={m["assist.settings.provider_title"]()} hint={m["assist.settings.model_in_chat"]()}>
          <SettingsRow label={m["assist.settings.service"]()} hint={local ? m["assist.local.about"]() : provider.about()}>
            <Select
              items={items}
              value={local ? 'local' : s.provider}
              disabled={!isAdmin}
              onValueChange={(v) => {
                if (!v || v === (local ? 'local' : s.provider)) return
                if (v === 'local') apply({ mode: 'practice_key', provider: 'openai_compatible', baseUrl: LOCAL_BASE_URL, autoModel: true }, m["assist.settings.provider_changed"]({ name: m["assist.local.service"]() }))
                else apply({ mode: 'practice_key', provider: v as Provider, autoModel: true, ...(v === 'openai_compatible' && local ? { baseUrl: '' } : {}) }, m["assist.settings.provider_changed"]({ name: providers.find((p) => p.id === v)!.label() }))
              }}
            >
              <SelectTrigger className="w-full sm:w-56" aria-label={m["assist.settings.service"]()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingsRow>

          {s.provider === 'openai_compatible' && !local && (
            <SettingsRow label={m["assist.settings.base_url"]()}>
              <Input
                value={baseUrl ?? s.baseUrl ?? ''}
                disabled={!isAdmin}
                placeholder="http://localhost:11434/v1"
                onChange={(e) => setBaseUrl(e.target.value)}
                onBlur={() => baseUrl !== null && baseUrl !== (s.baseUrl ?? '') && apply({ mode: 'practice_key', baseUrl }, m["settings.saved"]())}
              />
            </SettingsRow>
          )}

          {!local && (
          <SettingsRow label={m["assist.settings.key_label"]()} hint={provider.keyUrl ? m["assist.settings.key_where"]({ url: provider.keyUrl }) : undefined}>
            {s.keySource && !editingKey ? (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground tabular-nums">{s.keyHint}</span>
                {isAdmin && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditingKey(true)}>
                    {m["assist.settings.change_key"]()}
                  </Button>
                )}
              </div>
            ) : (
              <form
                className="flex w-full items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (key.trim()) saveKey()
                }}
              >
                <Input type="password" autoComplete="off" value={key} disabled={!isAdmin} placeholder={m["assist.settings.key_placeholder"]()} onChange={(e) => setKey(e.target.value)} />
                <Button type="submit" size="sm" disabled={!isAdmin || !key.trim() || save.isPending}>
                  {m["settings.save"]()}
                </Button>
              </form>
            )}
          </SettingsRow>
          )}
          {s.keySource === 'settings' && isAdmin && editingKey && !local && (
            <div className="flex justify-between">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditingKey(false)}>
                {m["protection.cancel"]()}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => { apply({ mode: 'practice_key', apiKey: '' }, m["assist.settings.key_removed"]()); setEditingKey(false) }}>
                {m["assist.settings.remove_key"]()}
              </Button>
            </div>
          )}
        </SettingsCard>
      )}

      {on && local && <LocalModel isAdmin={isAdmin} chosenModel={s.autoModel ? '' : s.model} onUse={(model) => apply({ mode: 'practice_key', model, autoModel: false }, m["assist.local.now_using"]({ model }))} />}

      {on && (
        <SettingsCard
          title={m["assist.settings.where_title"]()}
          hint={
            <>
              {m["assist.settings.point_sent_any"]()} {m["assist.settings.point_free"]()} {m["assist.settings.point_logged"]()}
            </>
          }
        >
          <SettingsRow
            label={local ? m["assist.local.allow"]() : m["assist.settings.allow_to"]({ name: serviceName })}
            hint={s.acknowledgedAt ? m["assist.settings.confirmed_by"]({ name: s.acknowledgedBy ?? '', date: formatDay(s.acknowledgedAt) }) : m["assist.settings.point_decide"]()}
          >
            {s.acknowledgedAt ? (
              <span className="text-muted-foreground">{m["assist.settings.confirmed"]()}</span>
            ) : (
              <Button size="sm" disabled={!isAdmin || save.isPending} onClick={() => apply({ mode: 'practice_key', acknowledge: true }, m["assist.settings.turned_on"]())}>
                {m["assist.settings.allow"]()}
              </Button>
            )}
          </SettingsRow>
        </SettingsCard>
      )}
    </>
  )
}
