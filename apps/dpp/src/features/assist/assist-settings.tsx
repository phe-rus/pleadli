import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { useJurisdiction } from '@/features/installation'
import { useSecurityStatus } from '@/features/security'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { Switch } from '@pleadli/ui/switch'
import { Textarea } from '@pleadli/ui/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { addLaw, deleteLaw, listLaws, listModels, syncLaws, type Provider } from './data'
import { useAssistSettings, useSaveAssistSettings } from './queries'

const providers: { id: Provider; label: () => string; about: () => string; keyUrl?: string }[] = [
  { id: 'gemini', label: () => 'Google Gemini', about: m["assist.provider.gemini"], keyUrl: 'aistudio.google.com/apikey' },
  { id: 'openrouter', label: () => 'OpenRouter', about: m["assist.provider.openrouter"], keyUrl: 'openrouter.ai/keys' },
  { id: 'anthropic', label: () => 'Anthropic Claude', about: m["assist.provider.anthropic"], keyUrl: 'console.anthropic.com' },
  { id: 'openai_compatible', label: m["assist.provider.other_label"], about: m["assist.provider.other"] },
]

/** Settings > Assist. Off until an administrator turns it on and confirms, in
 * so many words, that turning it on sends file contents to the provider. The
 * provider is one choice; the model is chosen automatically from the
 * provider's own list unless someone fixes one. Keys are never shown again. */
export function AssistPane() {
  const { data: status } = useSecurityStatus()
  const isAdmin = status?.actor?.role === 'administrator'
  const { data: s } = useAssistSettings()
  const save = useSaveAssistSettings()
  const [key, setKey] = useState('')
  const [baseUrl, setBaseUrl] = useState<string | null>(null)
  const [agree, setAgree] = useState(false)
  const [showModels, setShowModels] = useState(false)
  const models = useQuery({ queryKey: ['assist', 'models', s?.provider, s?.keyHint], queryFn: listModels, enabled: showModels && Boolean(s?.ready), staleTime: 10 * 60_000 })
  if (!s) return null
  const on = s.mode !== 'off'

  const apply = (change: Parameters<typeof save.mutate>[0], done?: string) =>
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
        hint={isAdmin ? m["settings.office.everyone_sees"]() : m["settings.admin_only"]()}
      >
        <label className="flex items-center justify-between gap-4">
          <span>{m["assist.settings.use"]()}</span>
          <Switch
            checked={on}
            disabled={!isAdmin || save.isPending}
            onCheckedChange={(checked) => apply({ mode: checked ? 'institution_key' : 'off' }, checked ? m["assist.settings.turned_on"]() : m["assist.settings.turned_off"]())}
          />
        </label>
      </SettingsCard>

      {on && (
        <SettingsCard
          title={m["assist.settings.where_title"]()}
          badge={s.acknowledgedAt ? <Tag tone="done">{m["assist.settings.confirmed"]()}</Tag> : <Tag tone="urgent">{m["assist.settings.not_confirmed"]()}</Tag>}
          description={m["assist.settings.where_body"]()}
          hint={s.acknowledgedAt ? m["assist.settings.confirmed_by"]({ name: s.acknowledgedBy ?? '', date: formatDate(s.acknowledgedAt) }) : undefined}
          action={
            !s.acknowledgedAt &&
            isAdmin && (
              <Button size="sm" disabled={!agree || save.isPending} onClick={() => apply({ mode: 'institution_key', acknowledge: true }, m["assist.settings.turned_on"]())}>
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
            apply({ mode: 'institution_key', apiKey: key.trim() || undefined, baseUrl: baseUrl ?? undefined }, m["settings.saved"]())
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
                onClick={() => p.id !== s.provider && apply({ mode: 'institution_key', provider: p.id, autoModel: true }, m["assist.settings.provider_changed"]({ name: p.label() }))}
                className={cn('flex cursor-pointer flex-col gap-0.5 rounded-xl p-3 text-left ring-1 transition-colors', s.provider === p.id ? 'bg-primary/5 ring-primary' : 'ring-border hover:bg-secondary/50')}
              >
                <strong>{p.label()}</strong>
                <span className="text-xs text-muted-foreground">{p.about()}</span>
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
              <span className="text-xs text-muted-foreground">{m["assist.settings.key_where"]({ url: providers.find((p) => p.id === s.provider)!.keyUrl! })}</span>
            )}
          </label>
          {s.keySource === 'settings' && isAdmin && (
            <Button type="button" size="sm" variant="ghost" className="w-fit text-destructive" onClick={() => apply({ mode: 'institution_key', apiKey: '' }, m["assist.settings.key_removed"]())}>
              {m["assist.settings.remove_key"]()}
            </Button>
          )}
        </SettingsCard>
      )}

      {on && (
        <SettingsCard title={m["assist.settings.model_title"]()} description={m["assist.settings.model_body"]()}>
          <label className="flex items-center justify-between gap-4">
            <span>{m["assist.settings.auto_model"]()}</span>
            <Switch checked={s.autoModel} disabled={!isAdmin} onCheckedChange={(v) => apply({ mode: 'institution_key', autoModel: v })} />
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
                        onClick={() => apply({ mode: 'institution_key', model: x.id, autoModel: false }, m["assist.settings.model_fixed"]({ model: x.label }))}
                        className={cn('flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-secondary/60', chosen && 'bg-primary/5 ring-1 ring-primary/40')}
                      >
                        <span className="min-w-0 truncate">{x.label}</span>
                        {x.rank && s.autoModel ? <span className="shrink-0 text-xs text-primary">{x.rank === 1 ? m["assist.settings.auto_first"]() : m["assist.settings.auto_backup"]({ n: x.rank })}</span> : chosen ? <span className="shrink-0 text-xs text-primary">{m["assist.settings.in_use"]()}</span> : null}
                      </button>
                    </li>
                  )
                })}
            </ul>
          )}
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
