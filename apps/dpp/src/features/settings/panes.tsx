import { SettingsCard } from '@/components/settings-card'
import { serviceNames } from '@/lib/jurisdiction'
import { Tag } from '@/components/status-tag'
import { RowList, Row } from '@/components/operational-row'
import { Toggletheme } from '@/components/toggle-theme'
import { defaultLogo } from '@/features/brand'
import { changeLocale, localeNames, selectableLocales, useLocale } from '@/features/i18n'
import {
  createStaff,
  installationOptions,
  resetSecondFactor,
  setProtection,
  setStaffSecret,
  staffOptions,
  staffRoles,
  setJurisdiction,
  updateInstallation,
  updateStaff,
  type Staff,
  type StaffRole,
} from '@/features/installation'
import { useProsecutorProfile, useSaveProsecutorProfile } from '@/features/prosecutor-profile'
import { lockNow, setIdleMinutes, useSecurityStatus } from '@/features/security'
import { AuditCard, DataProtection } from '@/features/security/settings-panes'
import { idleChoices } from '@/features/security/schema'
import { isIntakeAlertsEnabled, setIntakeAlertsEnabled } from '@/hooks/use-intake-alerts'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { ACCENTS, applyAccent, COUNTRIES, findCountry, LICENCE, type Locale } from '@pleadli/setup'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Switch } from '@pleadli/ui/switch'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

const say = (error: unknown) => (error instanceof ApiError ? error.message : m["common.try_again"]())

const roleLabel = (role: StaffRole) => ({ administrator: m["staff.role.administrator"], prosecutor: m["staff.role.prosecutor"], clerk: m["staff.role.clerk"] })[role]()

function useIsAdmin() {
  const { data: status } = useSecurityStatus()
  return status?.actor?.role === 'administrator'
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId()
  return (
    // A row, as System Settings lays one out: the label on the left, the
    // control on the right, the note under the control. Stacks on a narrow window.
    <div className="grid grid-cols-1 items-center gap-x-6 gap-y-1.5 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <label htmlFor={id} className="text-[0.8125rem] sm:text-right">
        {label}
      </label>
      <div id={id} className="flex min-w-0 flex-col">
        {children}
      </div>
      {hint && <p className="text-[0.8125rem] text-muted-foreground sm:col-start-2">{hint}</p>}
    </div>
  )
}

function Choose<T extends string>({ value, items, onChange, disabled }: { value: T; items: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <Select items={items} value={value} disabled={disabled} onValueChange={(v) => v && onChange(v as T)}>
      <SelectTrigger className="w-full">
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
  )
}

/** A PIN field or a password field, whichever the protection level asks for. */
function SecretInput({ level, value, onChange, placeholder }: { level: 'basic' | 'full'; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const pin = level === 'basic'
  return (
    <Input
      type="password"
      inputMode={pin ? 'numeric' : undefined}
      maxLength={pin ? 6 : undefined}
      autoComplete="new-password"
      placeholder={placeholder ?? (pin ? m["staff.pin_placeholder"]() : m["staff.password_placeholder"]())}
      value={value}
      onChange={(e) => onChange(pin ? e.target.value.replace(/\D/g, '') : e.target.value)}
    />
  )
}

const secretOk = (level: 'basic' | 'full', v: string) => (level === 'basic' ? /^\d{6}$/.test(v) : v.length >= 12)

// ---------------------------------------------------------------- You

export function YouPane() {
  const queryClient = useQueryClient()
  const { data: profile } = useProsecutorProfile()
  const { data: status } = useSecurityStatus()
  const save = useSaveProsecutorProfile()
  const isAdmin = status?.actor?.role === 'administrator'
  const [name, setName] = useState(profile?.name ?? '')
  const [rank, setRank] = useState(profile?.rank ?? '')
  const [isDpp, setIsDpp] = useState(profile?.isDpp ?? false)
  const [secret, setSecret] = useState('')
  const level = status?.level

  useEffect(() => {
    if (!profile) return
    setName(profile.name)
    setRank(profile.rank ?? '')
    setIsDpp(profile.isDpp)
  }, [profile])

  return (
    <>
      <SettingsCard
        title={m["settings.you.identity"]()}
        description={m["settings.you.identity_description"]()}
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await save.mutateAsync({ name, rank: rank.trim() ? rank : null, isDpp })
            await queryClient.invalidateQueries({ queryKey: ['security'] })
            t.success(m["settings.saved"]())
          } catch (error) {
            t.error(m["settings.save_failed"](), { description: say(error) })
          }
        }}
        action={
          <Button type="submit" size="sm" disabled={!name.trim() || save.isPending}>
            {m["settings.save"]()}
          </Button>
        }
      >
        <Field label={m["staff.name"]()}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label={m["staff.rank"]()}>
          <Input value={rank} onChange={(e) => setRank(e.target.value)} placeholder={m["staff.rank_placeholder"]({ rank: serviceNames().rankExample ?? '...' })} />
        </Field>
        <label className="flex items-start justify-between gap-4">
          <span className="flex flex-col gap-1">
            <strong>{m["staff.flag.is_dpp"]({ head: serviceNames().head })}</strong>
            <span className="text-muted-foreground">{isAdmin ? m["staff.flag.is_dpp_hint"]({ head: serviceNames().head }) : m["staff.flag.admin_only"]()}</span>
          </span>
          <Switch checked={isDpp} disabled={!isAdmin} onCheckedChange={setIsDpp} />
        </label>
      </SettingsCard>

      {(level === 'basic' || level === 'full') && status?.actor && (
        <SettingsCard
          title={level === 'basic' ? m["settings.you.pin"]() : m["settings.you.password"]()}
          description={level === 'basic' ? m["settings.you.pin_description"]() : m["settings.you.password_description"]()}
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              await setStaffSecret(status.actor!.id, secret)
              setSecret('')
              t.success(m["settings.saved"]())
            } catch (error) {
              t.error(m["settings.save_failed"](), { description: say(error) })
            }
          }}
          action={
            <Button type="submit" size="sm" disabled={!secretOk(level, secret)}>
              {m["settings.you.change"]()}
            </Button>
          }
        >
          <SecretInput level={level} value={secret} onChange={setSecret} />
        </SettingsCard>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Office

const MAX_LOGO_BYTES = 1024 * 1024

function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(file.type) || file.size > MAX_LOGO_BYTES) return reject(new Error('logo'))
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('logo'))
    reader.readAsDataURL(file)
  })
}

export function OfficePane() {
  const queryClient = useQueryClient()
  const locale = useLocale() as Locale
  const isAdmin = useIsAdmin()
  const { data: install } = useQuery(installationOptions())
  const [officeName, setOfficeName] = useState('')
  const [region, setRegion] = useState('')
  const [language, setLanguage] = useState('en')
  const [accent, setAccent] = useState('gold')
  const [logo, setLogo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!install) return
    setOfficeName(install.officeName)
    setRegion(install.region ?? '')
    setLanguage(install.language)
    setAccent(install.accent)
    setLogo(install.logo)
  }, [install])
  // Show the colour on the whole window as it is picked; saving keeps it.
  useEffect(() => {
    if (install) applyAccent(accent)
    return () => applyAccent(queryClient.getQueryData<{ accent: string | null }>(['installation', 'brand'])?.accent)
  }, [accent, install, queryClient])

  if (!install) return null
  const country = findCountry(install.jurisdiction)

  return (
    <>
      <SettingsCard
        title={m["settings.office.title"]()}
        badge={<Tag tone="neutral">{install.model === 'headquarters' ? m["settings.office.headquarters"]() : m["settings.office.office"]()}</Tag>}
        description={install.model === 'headquarters' ? m["settings.office.hq_description"]() : m["settings.office.office_description"]()}
        hint={isAdmin ? m["settings.office.everyone_sees"]() : m["settings.admin_only"]()}
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await updateInstallation({ officeName, region: region.trim() || null, language, accent, logo })
            await queryClient.invalidateQueries({ queryKey: ['installation'] })
            t.success(m["settings.saved"]())
          } catch (error) {
            t.error(m["settings.save_failed"](), { description: say(error) })
          } finally {
            setBusy(false)
          }
        }}
        action={
          isAdmin && (
            <Button type="submit" size="sm" disabled={busy || !officeName.trim()}>
              {m["settings.save"]()}
            </Button>
          )
        }
      >
        <Field label={m["settings.office.name"]()}>
          <Input value={officeName} disabled={!isAdmin} onChange={(e) => setOfficeName(e.target.value)} />
        </Field>
        {install.model === 'office' && country && (
          <Field label={country.regionLabel[locale]}>
            {country.regions.length > 0 ? (
              <Choose value={region} disabled={!isAdmin} items={country.regions.map((r) => ({ value: r, label: r }))} onChange={setRegion} />
            ) : (
              <Input value={region} disabled={!isAdmin} onChange={(e) => setRegion(e.target.value)} />
            )}
          </Field>
        )}
        {import.meta.env.DEV && isAdmin ? (
          <Field label={m["settings.office.country"]()} hint={m["settings.office.country_dev_hint"]()}>
            <Choose
              value={install.jurisdiction}
              items={COUNTRIES.map((c) => ({ value: c.code, label: c.name[locale] }))}
              onChange={async (code) => {
                // The picker can report its own value again when the record refreshes: only a real change switches.
                if (code === install.jurisdiction) return
                try {
                  await setJurisdiction(code, null)
                  setRegion('')
                  await queryClient.invalidateQueries({ queryKey: ['installation'] })
                  t.success(m["settings.office.country_changed"]({ country: findCountry(code)?.name[locale] ?? code }))
                  // Names worked out outside React (decisions, references) follow on the next load.
                  setTimeout(() => window.location.reload(), 800)
                } catch (error) {
                  t.error(m["settings.save_failed"](), { description: say(error) })
                }
              }}
            />
          </Field>
        ) : (
          <Field label={m["settings.office.country"]()} hint={m["settings.office.country_hint"]()}>
            <Input value={country?.name[locale] ?? install.jurisdiction} disabled />
          </Field>
        )}
        <Field label={m["settings.office.language"]()} hint={m["settings.office.language_hint"]()}>
          <Choose value={language} disabled={!isAdmin} items={selectableLocales.map((l) => ({ value: l, label: localeNames[l] }))} onChange={setLanguage} />
        </Field>

        <div className="flex items-center gap-4 border-t pt-4">
          <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-border bg-white p-2">
            <img src={logo ?? defaultLogo(install.jurisdiction)} alt="" className="size-full object-contain" />
          </div>
          <div className="flex flex-col gap-2">
            <strong>{m["settings.office.logo"]()}</strong>
            <p className="text-muted-foreground">{m["settings.office.logo_hint"]()}</p>
            {isAdmin && (
              <div className="flex gap-2">
                <input
                  ref={file}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="sr-only"
                  onChange={async (e) => {
                    const chosen = e.target.files?.[0]
                    e.target.value = ''
                    if (!chosen) return
                    try {
                      setLogo(await readLogo(chosen))
                    } catch {
                      t.error(m["settings.office.logo_failed"]())
                    }
                  }}
                />
                <Button type="button" size="sm" variant="outline" onClick={() => file.current?.click()}>
                  {m["settings.office.logo_upload"]()}
                </Button>
                {logo && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setLogo(null)}>
                    {m["settings.office.logo_default"]()}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <strong>{m["settings.office.colour"]()}</strong>
          <div role="radiogroup" aria-label={m["settings.office.colour"]()} className="flex flex-wrap gap-2.5">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={a.id === accent}
                aria-label={a.name[locale]}
                title={a.name[locale]}
                disabled={!isAdmin}
                onClick={() => setAccent(a.id)}
                className={cn(
                  'size-7 rounded-full ring-offset-2 ring-offset-card transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring disabled:hover:scale-100',
                  a.id === accent && 'ring-2 ring-foreground',
                )}
                style={{ background: a.light.primary }}
              />
            ))}
          </div>
        </div>
      </SettingsCard>
    </>
  )
}

// ---------------------------------------------------------------- People

function PersonEditor({ person, level, onDone }: { person: Staff; level: 'none' | 'basic' | 'full'; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(person.name)
  const [rank, setRank] = useState(person.rank ?? '')
  const [role, setRole] = useState<StaffRole>(person.role)
  const [isDpp, setIsDpp] = useState(person.isDpp)
  const [active, setActive] = useState(person.active)
  const [secret, setSecret] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['installation'] })

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={m["staff.name"]()}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={m["staff.rank"]()}>
          <Input value={rank} onChange={(e) => setRank(e.target.value)} />
        </Field>
      </div>
      <Field label={m["staff.role_label"]()}>
        <Choose value={role} items={staffRoles.map((r) => ({ value: r, label: roleLabel(r) }))} onChange={setRole} />
      </Field>
      <label className="flex items-center justify-between gap-4">
        <span>{m["staff.flag.is_dpp"]({ head: serviceNames().head })}</span>
        <Switch checked={isDpp} onCheckedChange={setIsDpp} />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span>{m["staff.active"]()}</span>
        <Switch checked={active} onCheckedChange={setActive} />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          {m["common.cancel"]()}
        </Button>
        <Button
          size="sm"
          disabled={!name.trim()}
          onClick={async () => {
            try {
              await updateStaff(person.id, { name, rank: rank.trim() || null, role, isDpp, active })
              await refresh()
              t.success(m["settings.saved"]())
              onDone()
            } catch (error) {
              t.error(m["settings.save_failed"](), { description: say(error) })
            }
          }}
        >
          {m["settings.save"]()}
        </Button>
      </div>

      {level !== 'none' && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <strong>{level === 'basic' ? m["staff.new_pin"]() : m["staff.new_password"]()}</strong>
          <div className="flex gap-2">
            <SecretInput level={level} value={secret} onChange={setSecret} />
            <Button
              size="sm"
              variant="outline"
              disabled={!secretOk(level, secret)}
              onClick={async () => {
                try {
                  await setStaffSecret(person.id, secret)
                  setSecret('')
                  await refresh()
                  t.success(m["settings.saved"]())
                } catch (error) {
                  t.error(m["settings.save_failed"](), { description: say(error) })
                }
              }}
            >
              {m["staff.set"]()}
            </Button>
          </div>
          {level === 'full' && person.hasSecondFactor && (
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={async () => {
                try {
                  await resetSecondFactor(person.id)
                  await refresh()
                  t.success(m["staff.phone_reset_done"]())
                } catch (error) {
                  t.error(m["settings.save_failed"](), { description: say(error) })
                }
              }}
            >
              {m["staff.phone_reset"]()}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function AddPerson({ level, onDone }: { level: 'none' | 'basic' | 'full'; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [rank, setRank] = useState('')
  const [role, setRole] = useState<StaffRole>('prosecutor')
  const [secret, setSecret] = useState('')
  const ok = name.trim() && (level === 'none' || secretOk(level, secret))
  return (
    <SettingsCard
      title={m["staff.add"]()}
      description={level === 'full' ? m["staff.add_full_hint"]() : m["staff.add_hint"]()}
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await createStaff({ name, rank: rank.trim() || null, role, isDpp: false, secret: level === 'none' ? null : secret })
          await queryClient.invalidateQueries({ queryKey: ['installation'] })
          t.success(m["staff.added"]({ name }))
          onDone()
        } catch (error) {
          t.error(m["settings.save_failed"](), { description: say(error) })
        }
      }}
      action={
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            {m["common.cancel"]()}
          </Button>
          <Button type="submit" size="sm" disabled={!ok}>
            {m["staff.add"]()}
          </Button>
        </div>
      }
    >
      <Field label={m["staff.name"]()}>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label={m["staff.rank"]()}>
        <Input value={rank} onChange={(e) => setRank(e.target.value)} placeholder={m["staff.rank_placeholder"]({ rank: serviceNames().rankExample ?? '...' })} />
      </Field>
      <Field label={m["staff.role_label"]()}>
        <Choose value={role} items={staffRoles.map((r) => ({ value: r, label: roleLabel(r) }))} onChange={setRole} />
      </Field>
      {level !== 'none' && (
        <Field label={level === 'basic' ? m["staff.first_pin"]() : m["staff.first_password"]()}>
          <SecretInput level={level} value={secret} onChange={setSecret} />
        </Field>
      )}
    </SettingsCard>
  )
}

export function PeoplePane() {
  const isAdmin = useIsAdmin()
  const { data: status } = useSecurityStatus()
  const { data: people } = useQuery(staffOptions())
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const level = status?.level ?? 'none'

  return (
    <>
      {level === 'none' && <p className="text-muted-foreground">{m["staff.none_level_hint"]()}</p>}
      <SettingsCard
        title={m["staff.title"]()}
        description={m["staff.description"]()}
        hint={isAdmin ? undefined : m["settings.admin_only"]()}
        action={
          isAdmin &&
          level !== 'none' &&
          !adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              {m["staff.add"]()}
            </Button>
          )
        }
      >
        <RowList>
          {(people ?? []).map((p) => (
            <div key={p.id} className="flex flex-col gap-2">
              <Row
                aligned
                title={p.name}
                summary={[p.rank, roleLabel(p.role), p.isDpp ? m["staff.flag.is_dpp"]({ head: serviceNames().head }) : null].filter(Boolean).join(' · ')}
                trailing={
                  <span className="flex items-center gap-2">
                    {!p.active && <Tag tone="neutral">{m["staff.inactive"]()}</Tag>}
                    {level === 'full' && !p.hasSecondFactor && p.active && <Tag tone="open">{m["staff.phone_pending"]()}</Tag>}
                    {level !== 'none' && !p.secretKind && <Tag tone="open">{m["staff.no_secret"]()}</Tag>}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                        {m["staff.edit"]()}
                      </Button>
                    )}
                  </span>
                }
              />
              {editing === p.id && <PersonEditor person={p} level={level} onDone={() => setEditing(null)} />}
            </div>
          ))}
        </RowList>
      </SettingsCard>
      {adding && <AddPerson level={level} onDone={() => setAdding(false)} />}
    </>
  )
}

// ---------------------------------------------------------------- Protection

export function ProtectionPane() {
  const queryClient = useQueryClient()
  const isAdmin = useIsAdmin()
  const { data: status } = useSecurityStatus()
  const [next, setNext] = useState<'none' | 'basic' | 'full'>(status?.level ?? 'basic')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['security'] })
  if (!status?.level) return null
  const level = status.level
  const levelText = { none: m["protection.none"](), basic: m["protection.basic"](), full: m["protection.full"]() }
  const levelAbout = { none: m["protection.none_about"](), basic: m["protection.basic_about"](), full: m["protection.full_about"]() }
  const needsSecret = next !== 'none'
  const ready = next !== level && (!needsSecret || secretOk(next, secret))

  return (
    <>
      <SettingsCard
        title={m["protection.title"]()}
        badge={<Tag tone={level === 'none' ? 'open' : 'done'}>{levelText[level]}</Tag>}
        description={levelAbout[level]}
        hint={isAdmin ? m["protection.change_hint"]() : m["settings.admin_only"]()}
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await setProtection(next, needsSecret ? secret : null)
            setSecret('')
            await refresh()
            await queryClient.invalidateQueries({ queryKey: ['installation'] })
            t.success(m["protection.changed"]({ level: levelText[next] }))
          } catch (error) {
            t.error(m["settings.save_failed"](), { description: say(error) })
          } finally {
            setBusy(false)
          }
        }}
        action={
          isAdmin && (
            <Button type="submit" size="sm" disabled={!ready || busy}>
              {m["protection.change"]()}
            </Button>
          )
        }
      >
        {isAdmin && (
          <>
            <div role="radiogroup" aria-label={m["protection.title"]()} className="flex flex-col gap-2">
              {(['none', 'basic', 'full'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={next === l}
                  onClick={() => setNext(l)}
                  className={cn('flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors', next === l ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-foreground/20')}
                >
                  <strong>{levelText[l]}</strong>
                  <span className="text-muted-foreground">{levelAbout[l]}</span>
                </button>
              ))}
            </div>
            {needsSecret && next !== level && (
              <Field label={next === 'basic' ? m["protection.your_new_pin"]() : m["protection.your_new_password"]()} hint={next === 'full' ? m["protection.full_next_sign_in"]() : m["protection.others_need_new"]()}>
                <SecretInput level={next} value={secret} onChange={setSecret} />
              </Field>
            )}
          </>
        )}
      </SettingsCard>

      {level !== 'none' && (
        <SettingsCard title={m["protection.idle"]()} description={m["protection.idle_description"]()}>
          <div className="flex items-center justify-between gap-3">
            <select
              className="h-8 rounded-md border border-input bg-input/20 px-2"
              value={status.idleMinutes}
              disabled={!isAdmin}
              onChange={(e) => void setIdleMinutes(Number(e.target.value)).then(refresh, (err) => t.error(m["settings.save_failed"](), { description: say(err) }))}
            >
              {idleChoices.map((c) => (
                <option key={c.minutes} value={c.minutes}>
                  {c.label()}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={() => void lockNow().then(refresh)}>
              {m["workspace.sign_out"]()}
            </Button>
          </div>
        </SettingsCard>
      )}

      <DataProtection />
      <AuditCard />
    </>
  )
}

// ---------------------------------------------------------------- This computer

export function AppearancePane() {
  const locale = useLocale()
  return (
    <>
      <SettingsCard title={m["settings.theme.title"]()} description={m["settings.theme.description"]()}>
        <div className="w-40">
          <Toggletheme />
        </div>
      </SettingsCard>
      <SettingsCard title={m["settings.language.label"]()} description={m["settings.language.description"]()}>
        <div role="radiogroup" aria-label={m["settings.language.label"]()} className="grid grid-cols-2 gap-2">
          {selectableLocales.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={l === locale}
              lang={l}
              onClick={() => changeLocale(l)}
              className={cn('rounded-lg border px-3 py-2 text-left transition-colors', l === locale ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-foreground/20')}
            >
              {localeNames[l]}
            </button>
          ))}
        </div>
      </SettingsCard>
    </>
  )
}

export function NotificationsPane() {
  const [enabled, setEnabled] = useState(isIntakeAlertsEnabled)
  return (
    <SettingsCard title={m["settings.alerts.title"]()} description={m["settings.alerts.description"]()} hint={m["settings.alerts.hint"]()}>
      <label className="flex items-center justify-between gap-4">
        <strong>{m["settings.alerts.toggle"]()}</strong>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            setIntakeAlertsEnabled(checked)
            setEnabled(checked)
          }}
        />
      </label>
    </SettingsCard>
  )
}

// ---------------------------------------------------------------- Licence

export function LicencePane() {
  const locale = useLocale() as Locale
  const { data: install } = useQuery(installationOptions())
  const text = LICENCE[locale]
  return (
    <>
      {install && (
        <SettingsCard title={m["settings.licence.accepted"]()}>
          <p>{m["settings.licence.accepted_line"]({ version: install.licenceVersion, date: formatDate(install.licenceAcceptedAt, 'long'), name: install.licenceAcceptedBy })}</p>
        </SettingsCard>
      )}
      <SettingsCard title={text.title}>
        <article className="flex flex-col gap-3">
          {text.sections.map((s) => (
            <section key={s.heading} className="flex flex-col gap-1">
              <h4>{s.heading}</h4>
              <p>{s.body}</p>
            </section>
          ))}
        </article>
      </SettingsCard>
    </>
  )
}
