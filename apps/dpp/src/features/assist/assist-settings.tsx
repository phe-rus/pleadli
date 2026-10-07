import { SettingsCard, SettingsRow } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { useJurisdiction } from '@/features/installation'
import { useSecurityStatus } from '@/features/security'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Switch } from '@pleadli/ui/switch'
import { Textarea } from '@pleadli/ui/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { addLaw, deleteLaw, listLaws, syncLaws, type Provider } from './data'
import { isLocal, LOCAL_BASE_URL, LocalModel } from './local-model'
import { useAssistSettings, useSaveAssistSettings } from './queries'

const providers: { id: Provider; label: () => string; about: () => string; keyUrl?: string }[] = [
  { id: 'gemini', label: () => 'Google Gemini', about: m["assist.provider.gemini"], keyUrl: 'aistudio.google.com/apikey' },
  { id: 'openrouter', label: () => 'OpenRouter', about: m["assist.provider.openrouter"], keyUrl: 'openrouter.ai/keys' },
  { id: 'anthropic', label: () => 'Anthropic Claude', about: m["assist.provider.anthropic"], keyUrl: 'console.anthropic.com' },
  { id: 'openai_compatible', label: m["assist.provider.other_label"], about: m["assist.provider.other"] },
]

/** Settings > Assist, kept to what an office decides once: whether to use it,
 * whose service it uses with which key, and that a file may go there. Which
 * model answers is chosen in Assist itself, by whoever is asking. Keys are
 * kept locked on this computer and never come back. */
export function AssistPane() {
  const { data: status } = useSecurityStatus()
  const isAdmin = status?.actor?.role === 'administrator'
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

  const apply = (change: Parameters<typeof save.mutate>[0], done?: string) =>
    save.mutate(change, {
      onSuccess: () => done && t.success(done),
      onError: (e) => t.error(m["settings.save_failed"](), { description: e.message }),
    })
  const saveKey = () => {
    apply({ mode: 'institution_key', apiKey: key.trim() }, m["settings.saved"]())
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
            onCheckedChange={(checked) => apply({ mode: checked ? 'institution_key' : 'off' }, checked ? m["assist.settings.turned_on"]() : m["assist.settings.turned_off"]())}
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
                if (v === 'local') apply({ mode: 'institution_key', provider: 'openai_compatible', baseUrl: LOCAL_BASE_URL, autoModel: true }, m["assist.settings.provider_changed"]({ name: m["assist.local.service"]() }))
                else apply({ mode: 'institution_key', provider: v as Provider, autoModel: true, ...(v === 'openai_compatible' && local ? { baseUrl: '' } : {}) }, m["assist.settings.provider_changed"]({ name: providers.find((p) => p.id === v)!.label() }))
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
                onBlur={() => baseUrl !== null && baseUrl !== (s.baseUrl ?? '') && apply({ mode: 'institution_key', baseUrl }, m["settings.saved"]())}
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
                {m["assist.settings.cancel"]()}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => { apply({ mode: 'institution_key', apiKey: '' }, m["assist.settings.key_removed"]()); setEditingKey(false) }}>
                {m["assist.settings.remove_key"]()}
              </Button>
            </div>
          )}
        </SettingsCard>
      )}

      {on && local && <LocalModel isAdmin={isAdmin} chosenModel={s.autoModel ? '' : s.model} onUse={(model) => apply({ mode: 'institution_key', model, autoModel: false }, m["assist.local.now_using"]({ model }))} />}

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
            hint={s.acknowledgedAt ? m["assist.settings.confirmed_by"]({ name: s.acknowledgedBy ?? '', date: formatDate(s.acknowledgedAt) }) : m["assist.settings.point_decide"]()}
          >
            {s.acknowledgedAt ? (
              <span className="text-muted-foreground">{m["assist.settings.confirmed"]()}</span>
            ) : (
              <Button size="sm" disabled={!isAdmin || save.isPending} onClick={() => apply({ mode: 'institution_key', acknowledge: true }, m["assist.settings.turned_on"]())}>
                {m["assist.settings.allow"]()}
              </Button>
            )}
          </SettingsRow>
        </SettingsCard>
      )}

      {on && <LawsCard canEdit={isAdmin} tokenSet={s.lawsTokenSet} onToken={(token) => apply({ mode: 'institution_key', lawsToken: token }, m["settings.saved"]())} />}
    </>
  )
}

/** The law Assist may quote: each statute's text with the date it is correct
 * at. Laws.Africa keeps Uganda's (and other countries') current; texts for a
 * country it does not cover are pasted in by hand, with their date. */
function LawsCard({ canEdit, tokenSet, onToken }: { canEdit: boolean; tokenSet: boolean; onToken: (token: string) => void }) {
  const country = useJurisdiction()
  const code = country?.code ?? ''
  const queryClient = useQueryClient()
  const { data: laws = [] } = useQuery({ queryKey: ['laws', code], queryFn: () => listLaws(code), enabled: Boolean(code) })
  const [token, setToken] = useState('')
  const [adding, setAdding] = useState(false)
  const [manual, setManual] = useState({ title: '', cite: '', asAt: '', body: '' })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['laws', code] })
  const sync = useMutation({
    mutationFn: () => syncLaws(code, country?.laws.map((l) => l.title) ?? []),
    onSuccess: (r) => {
      void refresh()
      t.success(m["laws.synced"]({ updated: r.updated.length }), { description: r.notFound.length ? m["laws.not_found"]({ titles: r.notFound.join(', ') }) : undefined })
    },
    onError: (e) => t.error(m["laws.sync_failed"](), { description: e.message }),
  })
  const add = useMutation({
    mutationFn: () => addLaw({ jurisdiction: code, title: manual.title, cite: manual.cite || null, asAt: manual.asAt || null, body: manual.body }),
    onSuccess: () => {
      void refresh()
      setAdding(false)
      setManual({ title: '', cite: '', asAt: '', body: '' })
    },
    onError: (e) => t.error(m["settings.save_failed"](), { description: e.message }),
  })
  const remove = useMutation({ mutationFn: deleteLaw, onSuccess: refresh })

  return (
    <SettingsCard
      title={m["laws.title"]()}
      badge={<Tag tone={laws.length ? 'done' : 'urgent'}>{m["laws.count"]({ count: laws.length })}</Tag>}
      description={m["laws.body"]({ country: country?.name.en ?? '' })}
    >
      {laws.length > 0 && (
        <ul className="flex list-none flex-col divide-y divide-border/60 p-0">
          {laws.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{l.title}</span>
                <span className="text-xs text-muted-foreground">{m["laws.as_at"]({ date: l.asAt ?? '?', source: l.source })}</span>
              </span>
              {canEdit && (
                <Button size="xs" variant="ghost" onClick={() => remove.mutate(l.id)}>
                  {m["court.remove"]()}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 rounded-xl bg-secondary/40 p-3">
        <strong>Laws.Africa</strong>
        <p className="text-muted-foreground">{m["laws.api_body"]()}</p>
        {!tokenSet && canEdit && (
          <div className="flex gap-2">
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={m["laws.token_placeholder"]()} />
            <Button size="sm" variant="secondary" disabled={!token.trim()} onClick={() => { onToken(token.trim()); setToken('') }}>
              {m["settings.save"]()}
            </Button>
          </div>
        )}
        {tokenSet && (
          <Button size="sm" className="w-fit" disabled={!canEdit || sync.isPending || !country?.laws.length} onClick={() => sync.mutate()}>
            {sync.isPending ? m["laws.syncing"]() : m["laws.sync"]()}
          </Button>
        )}
      </div>
      {canEdit &&
        (adding ? (
          <div className="flex flex-col gap-2">
            <Input value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} placeholder={m["laws.manual_title"]()} />
            <div className="grid grid-cols-2 gap-2">
              <Input value={manual.cite} onChange={(e) => setManual({ ...manual, cite: e.target.value })} placeholder={m["laws.manual_cite"]()} />
              <Input value={manual.asAt} onChange={(e) => setManual({ ...manual, asAt: e.target.value })} placeholder={m["laws.manual_as_at"]()} />
            </div>
            <Textarea value={manual.body} onChange={(e) => setManual({ ...manual, body: e.target.value })} className="min-h-40" placeholder={m["laws.manual_body"]()} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                {m["common.cancel"]()}
              </Button>
              <Button size="sm" disabled={!manual.title.trim() || manual.body.trim().length < 50 || add.isPending} onClick={() => add.mutate()}>
                {m["laws.manual_add"]()}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="w-fit" onClick={() => setAdding(true)}>
            {m["laws.add_by_hand"]()}
          </Button>
        ))}
    </SettingsCard>
  )
}
