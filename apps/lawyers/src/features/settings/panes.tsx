import { SignaturePad } from '@pleadli/paper'
import { parseShillings, ugx, useSetHourlyRate } from '@/features/money/data'
import { RowList, Row } from '@/components/operational-row'
import { SettingsCard, SettingsRow } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { IntegrityCard } from '@/features/audit'
import { PractisingCard } from '@/features/compliance'
import { buildRecordsZip, saveFile } from '@/features/export'
import { defaultLogo } from '@/features/brand'
import { changeLocale, localeNames, selectableLocales, useLocale } from '@/features/i18n'
import { useTheme } from '@/components/theme-provider'
import { Segmented } from '@pleadli/ui/segmented'
import { formatTime } from '@/lib/dates'
import { autoUpdate, checkNow, download as downloadUpdate, restart as restartApp, setAutoUpdate, useUpdateState } from '@/lib/updater'
import { PinField } from '@pleadli/ui/pin-field'
import {
  createStaff,
  installationOptions,
  practiceKinds,
  resetSecondFactor,
  setIdleMinutes,
  sealsOptions,
  setContacts,
  setJurisdiction,
  setProtection,
  setSignature,
  setStamp,
  setStaffSecret,
  setUsages,
  signOut,
  staffOptions,
  staffRoles,
  updateInstallation,
  updateStaff,
  useSessionStatus,
  useUsagesEnabled,
  type PracticeKind,
  type Setting,
  type Staff,
  type StaffRole,
} from '@/features/installation'
import { practiceKindText, UsageToggle } from '@/features/practice-setup/steps'
import { useProfile, useSaveProfile } from '@/features/profile'
import { usages, type Usage } from '@/features/usages'
import { ApiError } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { ACCENTS, applyAccent, COUNTRIES, findCountry, type Locale } from '@pleadli/setup'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Switch } from '@pleadli/ui/switch'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

const say = (error: unknown) => (error instanceof ApiError ? error.message : m["common.try_again"]())

export const roleLabel = (role: StaffRole) => ({ advocate: m["staff.role.advocate"], paralegal: m["staff.role.paralegal"], accounts: m["staff.role.accounts"] })[role]()

function useIsAdmin() {
  const { data: status } = useSessionStatus()
  return status?.actor?.isAdmin === true
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
function SecretInput({ level, value, onChange }: { level: 'basic' | 'full'; value: string; onChange: (v: string) => void }) {
  // A PIN shows as six places that fill as it is typed, so the count is never a guess.
  if (level === 'basic') return <PinField label={m["staff.pin_placeholder"]()} value={value} onChange={onChange} autoComplete="new-password" />
  return <Input type="password" autoComplete="new-password" className="rounded-lg" placeholder={m["staff.password_placeholder"]()} value={value} onChange={(e) => onChange(e.target.value)} />
}

const secretOk = (level: 'basic' | 'full', v: string) => (level === 'basic' ? /^\d{6}$/.test(v) : v.length >= 12)

// ---------------------------------------------------------------- You

export function YouPane() {
  const queryClient = useQueryClient()
  const { data: profile } = useProfile()
  const { data: status } = useSessionStatus()
  const save = useSaveProfile()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [secret, setSecret] = useState('')
  const level = status?.level
  const actor = status?.actor

  useEffect(() => {
    if (!profile) return
    setName(profile.name)
    setPhone(profile.phone ?? '')
    setEmail(profile.email ?? '')
  }, [profile])

  return (
    <>
      <SettingsCard
        title={m["settings.you.identity"]()}
        badge={actor && <Tag tone="neutral">{roleLabel(actor.role)}</Tag>}
        description={actor?.role === 'advocate' ? m["settings.you.identity_advocate"]() : m["settings.you.identity_other"]()}
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await save.mutateAsync({ name, firm: null, phone: phone.trim() || null, email: email.trim() || null })
            await queryClient.invalidateQueries({ queryKey: ['session'] })
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
        <SettingsRow label={m["staff.name"]()}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </SettingsRow>
        <SettingsRow label={m["staff.phone"]()}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </SettingsRow>
        <SettingsRow label={m["staff.email"]()}>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </SettingsRow>
      </SettingsCard>

      <SignatureCard />

      <PractisingCard />

      {(level === 'basic' || level === 'full') && actor && (
        <SettingsCard
          title={level === 'basic' ? m["settings.you.pin"]() : m["settings.you.password"]()}
          description={level === 'basic' ? m["settings.you.pin_description"]() : m["settings.you.password_description"]()}
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              await setStaffSecret(actor.id, secret)
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
          <SettingsRow label={level === 'basic' ? m["protection.your_new_pin"]() : m["protection.your_new_password"]()}>
            <SecretInput level={level} value={secret} onChange={setSecret} />
          </SettingsRow>
        </SettingsCard>
      )}
    </>
  )
}


// ---------------------------------------------------------------- Seals

/** An image kept for sealing what is filed: a person's signature, or the
 * practice's stamp. PNG or JPG (a PDF can carry those), at most 400 KB. */
function SealCard({ title, description, image, canChange, onSave, drawable = false }: { title: string; description: string; image: string | null | undefined; canChange: boolean; onSave: (image: string | null) => Promise<unknown>; drawable?: boolean }) {
  const file = useRef<HTMLInputElement>(null)
  const [signing, setSigning] = useState(false)
  const queryClient = useQueryClient()
  const save = async (next: string | null) => {
    try {
      await onSave(next)
      await queryClient.invalidateQueries({ queryKey: ['installation', 'seals'] })
      t.success(m["settings.saved"]())
    } catch (error) {
      t.error(m["settings.save_failed"](), { description: say(error) })
    }
  }
  return (
    <SettingsCard
      title={title}
      description={description}
      hint={canChange ? m["seal.hint"]() : m["settings.admin_only"]()}
      action={
        canChange && (
          <div className="flex gap-2">
            {image && (
              <Button type="button" size="sm" variant="ghost" onClick={() => void save(null)}>
                {m["seal.remove"]()}
              </Button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(e) => {
                const chosen = e.target.files?.[0]
                e.target.value = ''
                if (!chosen) return
                if (!/^image\/(png|jpeg)$/.test(chosen.type) || chosen.size > 400 * 1024) {
                  t.error(m["seal.bad_image"]())
                  return
                }
                const reader = new FileReader()
                reader.onload = () => void save(String(reader.result))
                reader.readAsDataURL(chosen)
              }}
            />
            {drawable && (
              <Button type="button" size="sm" disabled={signing} onClick={() => setSigning(true)}>
                {m["seal.draw"]()}
              </Button>
            )}
            <Button type="button" size="sm" variant={drawable ? 'outline' : 'default'} onClick={() => file.current?.click()}>
              {image ? m["seal.replace"]() : m["seal.upload"]()}
            </Button>
          </div>
        )
      }
    >
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border bg-white p-2">
        {image ? <img src={image} alt="" className="max-h-full object-contain" /> : <span className="text-muted-foreground">{m["seal.none"]()}</span>}
      </div>
      {signing && (
        <SignaturePad
          labels={{ hint: m["seal.pad_hint"](), clear: m["seal.pad_clear"](), done: m["seal.pad_done"](), cancel: m["common.cancel"]() }}
          onCancel={() => setSigning(false)}
          onDone={(png) => {
            setSigning(false)
            void save(png)
          }}
        />
      )}
    </SettingsCard>
  )
}

function LetterheadCard() {
  const queryClient = useQueryClient()
  const isAdmin = useIsAdmin()
  const { data: install } = useQuery(installationOptions())
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  useEffect(() => {
    if (!install) return
    setAddress(install.address ?? '')
    setPhone(install.phone ?? '')
    setEmail(install.email ?? '')
  }, [install])
  if (!install) return null
  return (
    <SettingsCard
      title={m["letterhead.title"]()}
      description={m["letterhead.description"]()}
      hint={isAdmin ? m["letterhead.hint"]() : m["settings.admin_only"]()}
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await setContacts({ address: address.trim() || null, phone: phone.trim() || null, email: email.trim() || null })
          await queryClient.invalidateQueries({ queryKey: ['installation'] })
          t.success(m["settings.saved"]())
        } catch (error) {
          t.error(m["settings.save_failed"](), { description: say(error) })
        }
      }}
      action={
        isAdmin && (
          <Button type="submit" size="sm">
            {m["settings.save"]()}
          </Button>
        )
      }
    >
      <SettingsRow label={m["letterhead.address"]()}>
        <Input value={address} disabled={!isAdmin} onChange={(e) => setAddress(e.target.value)} placeholder="Plot 4, Kampala Road, P.O. Box ____, Kampala" />
      </SettingsRow>
      <SettingsRow label={m["staff.phone"]()}>
        <Input value={phone} disabled={!isAdmin} onChange={(e) => setPhone(e.target.value)} />
      </SettingsRow>
      <SettingsRow label={m["staff.email"]()}>
        <Input value={email} disabled={!isAdmin} onChange={(e) => setEmail(e.target.value)} />
      </SettingsRow>
    </SettingsCard>
  )
}

/** The usual hourly rate, offered when time is put on a fee note. */
function HourlyRateCard() {
  const isAdmin = useIsAdmin()
  const { data: install } = useQuery(installationOptions())
  const setRate = useSetHourlyRate()
  const [rate, setRateText] = useState('')
  useEffect(() => {
    if (install) setRateText(install.hourlyRate ? String(install.hourlyRate) : '')
  }, [install])
  if (!install) return null
  return (
    <SettingsCard
      title={m["money.rate_title"]()}
      description={m["money.rate_description"]()}
      hint={isAdmin ? undefined : m["settings.admin_only"]()}
      onSubmit={(e) => {
        e.preventDefault()
        setRate.mutate(parseShillings(rate), { onSuccess: () => t.success(m["settings.saved"]()), onError: (error) => t.error(m["settings.save_failed"](), { description: say(error) }) })
      }}
      action={
        isAdmin && (
          <Button type="submit" size="sm" disabled={setRate.isPending}>
            {m["settings.save"]()}
          </Button>
        )
      }
    >
      <SettingsRow label={m["money.rate"]()}>
        <Input value={rate} disabled={!isAdmin} inputMode="numeric" placeholder="300000" onChange={(e) => setRateText(e.target.value)} />
      </SettingsRow>
      {parseShillings(rate) ? <p className="text-muted-foreground">{ugx(parseShillings(rate) ?? 0)}</p> : null}
    </SettingsCard>
  )
}

function SignatureCard() {
  const { data: seals } = useQuery(sealsOptions())
  const actor = useSessionStatus().data?.actor
  if (!actor) return null
  return (
    <SealCard
      title={m["seal.signature_title"]()}
      description={actor.role === 'advocate' ? m["seal.signature_description"]() : m["seal.signature_other"]()}
      image={seals?.signature}
      canChange
      drawable
      onSave={setSignature}
    />
  )
}

function StampCard() {
  const { data: seals } = useQuery(sealsOptions())
  const isAdmin = useIsAdmin()
  return <SealCard title={m["seal.stamp_title"]()} description={m["seal.stamp_description"]()} image={seals?.stamp} canChange={isAdmin} onSave={setStamp} />
}

// ---------------------------------------------------------------- Practice

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

function PracticeCard() {
  const queryClient = useQueryClient()
  const locale = useLocale() as Locale
  const isAdmin = useIsAdmin()
  const { data: install } = useQuery(installationOptions())
  const [officeName, setOfficeName] = useState('')
  const [region, setRegion] = useState('')
  const [language, setLanguage] = useState('en')
  const [accent, setAccent] = useState('navy')
  const [logo, setLogo] = useState<string | null>(null)
  const [setting, setSetting] = useState<Setting>('alone')
  const [kind, setKind] = useState<PracticeKind>('private')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!install) return
    setOfficeName(install.officeName)
    setRegion(install.region ?? '')
    setLanguage(install.language)
    setAccent(install.accent)
    setLogo(install.logo)
    setSetting(install.setting)
    setKind(install.practiceKind)
  }, [install])
  // Show the colour on the whole window as it is picked; saving keeps it.
  useEffect(() => {
    if (install) applyAccent(accent)
    return () => applyAccent(queryClient.getQueryData<{ accent: string | null }>(['installation', 'brand'])?.accent)
  }, [accent, install, queryClient])

  if (!install) return null
  const country = findCountry(install.jurisdiction)

  return (
    <SettingsCard
      title={m["settings.practice.title"]()}
      badge={<Tag tone="neutral">{setting === 'alone' ? m["setup.setting.alone"]() : m["setup.setting.firm"]()}</Tag>}
      description={m["settings.practice.description"]()}
      hint={isAdmin ? m["settings.practice.everyone_sees"]() : m["settings.admin_only"]()}
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          await updateInstallation({ officeName, region: region.trim() || null, language, accent, logo, setting, practiceKind: kind })
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
      <SettingsRow label={m["settings.practice.name"]()}>
        <Input value={officeName} disabled={!isAdmin} onChange={(e) => setOfficeName(e.target.value)} />
      </SettingsRow>
      <SettingsRow label={m["setup.practice.setting"]()}>
        <Choose
          value={setting}
          disabled={!isAdmin}
          items={[
            { value: 'alone' as const, label: m["setup.setting.alone"]() },
            { value: 'firm' as const, label: m["setup.setting.firm"]() },
          ]}
          onChange={setSetting}
        />
      </SettingsRow>
      <SettingsRow label={m["setup.practice.kind"]()}>
        <Choose value={kind} disabled={!isAdmin} items={practiceKinds.map((k) => ({ value: k, label: practiceKindText[k].title() }))} onChange={setKind} />
      </SettingsRow>
      {country && (
        <SettingsRow label={country.regionLabel[locale]}>
          {country.regions.length > 0 ? (
            <Choose value={region} disabled={!isAdmin} items={country.regions.map((r) => ({ value: r, label: r }))} onChange={setRegion} />
          ) : (
            <Input value={region} disabled={!isAdmin} onChange={(e) => setRegion(e.target.value)} />
          )}
        </SettingsRow>
      )}
      {import.meta.env.DEV && isAdmin ? (
        <SettingsRow label={m["settings.practice.country"]()} hint={m["settings.practice.country_dev_hint"]()}>
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
                t.success(m["settings.practice.country_changed"]({ country: findCountry(code)?.name[locale] ?? code }))
              } catch (error) {
                t.error(m["settings.save_failed"](), { description: say(error) })
              }
            }}
          />
        </SettingsRow>
      ) : (
        <SettingsRow label={m["settings.practice.country"]()} hint={m["settings.practice.country_hint"]()}>
          <Input value={country?.name[locale] ?? install.jurisdiction} disabled />
        </SettingsRow>
      )}
      <SettingsRow label={m["settings.practice.language"]()} hint={m["settings.practice.language_hint"]()}>
        <Choose value={language} disabled={!isAdmin} items={selectableLocales.map((l) => ({ value: l, label: localeNames[l] }))} onChange={setLanguage} />
      </SettingsRow>

      <div className="flex items-center gap-4 border-t pt-4">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-border bg-white p-2">
          <img src={logo ?? defaultLogo(install.jurisdiction)} alt="" className="size-full object-contain" />
        </div>
        <div className="flex flex-col gap-2">
          <strong>{m["settings.practice.logo"]()}</strong>
          <p className="text-muted-foreground">{m["settings.practice.logo_hint"]()}</p>
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
                    t.error(m["settings.practice.logo_failed"]())
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={() => file.current?.click()}>
                {m["settings.practice.logo_upload"]()}
              </Button>
              {logo && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setLogo(null)}>
                  {m["settings.practice.logo_default"]()}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <strong>{m["settings.practice.colour"]()}</strong>
        <div role="radiogroup" aria-label={m["settings.practice.colour"]()} className="flex flex-wrap gap-2.5">
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
  )
}

function UsagesCard() {
  const queryClient = useQueryClient()
  const isAdmin = useIsAdmin()
  const { data: enabled } = useUsagesEnabled()
  const [chosen, setChosen] = useState<Usage[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (enabled) setChosen(enabled)
  }, [enabled])
  if (!enabled) return null
  const changed = chosen.length !== enabled.length || chosen.some((u) => !enabled.includes(u))

  return (
    <SettingsCard
      title={m["settings.usages.title"]()}
      description={m["settings.usages.description"]()}
      hint={isAdmin ? (chosen.length === 0 ? m["setup.usages.none"]() : m["settings.usages.hint"]()) : m["settings.admin_only"]()}
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          await setUsages(chosen)
          await queryClient.invalidateQueries({ queryKey: ['installation', 'usages'] })
          t.success(m["settings.saved"]())
        } catch (error) {
          t.error(m["settings.save_failed"](), { description: say(error) })
        } finally {
          setBusy(false)
        }
      }}
      action={
        isAdmin && (
          <Button type="submit" size="sm" disabled={busy || !changed || chosen.length === 0}>
            {m["settings.save"]()}
          </Button>
        )
      }
    >
      <div className="grid gap-2">
        {usages.map((u) => (
          <UsageToggle
            key={u.id}
            id={u.id}
            checked={chosen.includes(u.id)}
            onToggle={() => isAdmin && setChosen((c) => (c.includes(u.id) ? c.filter((x) => x !== u.id) : [...c, u.id]))}
          />
        ))}
      </div>
    </SettingsCard>
  )
}

export function PracticePane() {
  return (
    <>
      <PracticeCard />
      <LetterheadCard />
      <HourlyRateCard />
      <StampCard />
      <UsagesCard />
      <RecordsCard />
    </>
  )
}

/** Nobody is locked in: every record, taken out in files any program opens. */
function RecordsCard() {
  const isAdmin = useIsAdmin()
  const [busy, setBusy] = useState(false)
  return (
    <SettingsCard
      title={m["export.records_title"]()}
      description={m["export.records_description"]()}
      hint={isAdmin ? m["export.records_hint"]() : m["export.admin_only"]()}
      action={
        <Button
          size="sm"
          disabled={!isAdmin || busy}
          onClick={async () => {
            setBusy(true)
            try {
              const { bytes, name } = await buildRecordsZip()
              if (await saveFile(bytes, name, 'zip')) t.success(m["export.saved"]())
            } catch (error) {
              t.error(m["export.failed"](), { description: say(error) })
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? m["export.preparing"]() : m["export.records_button"]()}
        </Button>
      }
    />
  )
}

// ---------------------------------------------------------------- People

function PersonEditor({ person, level, onDone }: { person: Staff; level: 'none' | 'basic' | 'full'; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(person.name)
  const [title, setTitle] = useState(person.title ?? '')
  const [role, setRole] = useState<StaffRole>(person.role)
  const [isAdmin, setIsAdmin] = useState(person.isAdmin)
  const [practising, setPractising] = useState(person.practisingNumber ?? '')
  const [active, setActive] = useState(person.active)
  const [secret, setSecret] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['installation'] })

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SettingsRow label={m["staff.name"]()}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </SettingsRow>
        <SettingsRow label={m["staff.title"]()}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </SettingsRow>
      </div>
      <SettingsRow label={m["staff.role_label"]()} hint={m[`staff.role_hint.${role}`]()}>
        <Choose value={role} items={staffRoles.map((r) => ({ value: r, label: roleLabel(r) }))} onChange={setRole} />
      </SettingsRow>
      {role === 'advocate' && (
        <SettingsRow label={m["staff.practising_number"]()}>
          <Input value={practising} onChange={(e) => setPractising(e.target.value)} />
        </SettingsRow>
      )}
      <label className="flex items-center justify-between gap-4">
        <span>{m["staff.is_admin"]()}</span>
        <Switch checked={isAdmin} onCheckedChange={setIsAdmin} />
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
              await updateStaff(person.id, {
                name,
                title: title.trim() || null,
                role,
                isAdmin,
                phone: person.phone,
                email: person.email,
                practisingNumber: role === 'advocate' ? practising.trim() || null : null,
                certificateExpiresOn: person.certificateExpiresOn,
                active,
              })
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
          <div className="flex flex-wrap items-center gap-3">
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

function AddPerson({ level, onDone }: { level: 'basic' | 'full'; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [role, setRole] = useState<StaffRole>('paralegal')
  const [secret, setSecret] = useState('')
  const ok = name.trim() && secretOk(level, secret)
  return (
    <SettingsCard
      title={m["staff.add"]()}
      description={level === 'full' ? m["staff.add_full_hint"]() : m["staff.add_hint"]()}
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await createStaff({ name, title: title.trim() || null, role, isAdmin: false, phone: null, email: null, secret })
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
      <SettingsRow label={m["staff.name"]()}>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </SettingsRow>
      <SettingsRow label={m["staff.title"]()}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </SettingsRow>
      <SettingsRow label={m["staff.role_label"]()} hint={m[`staff.role_hint.${role}`]()}>
        <Choose value={role} items={staffRoles.map((r) => ({ value: r, label: roleLabel(r) }))} onChange={setRole} />
      </SettingsRow>
      <SettingsRow label={level === 'basic' ? m["staff.first_pin"]() : m["staff.first_password"]()}>
        <SecretInput level={level} value={secret} onChange={setSecret} />
      </SettingsRow>
    </SettingsCard>
  )
}

export function PeoplePane() {
  const isAdmin = useIsAdmin()
  const { data: status } = useSessionStatus()
  const { data: install } = useQuery(installationOptions())
  const { data: people } = useQuery(staffOptions())
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const level = status?.level ?? 'none'
  const alone = install?.setting === 'alone'

  return (
    <>
      {alone ? (
        <p className="text-muted-foreground">{m["staff.alone_hint"]()}</p>
      ) : (
        level === 'none' && <p className="text-muted-foreground">{m["staff.none_level_hint"]()}</p>
      )}
      <SettingsCard
        title={m["staff.heading"]()}
        description={m["staff.description"]()}
        hint={isAdmin ? undefined : m["settings.admin_only"]()}
        action={
          isAdmin &&
          level !== 'none' &&
          !alone &&
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
                summary={[p.title, roleLabel(p.role), p.isAdmin ? m["staff.is_admin"]() : null].filter(Boolean).join(' · ')}
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
      {adding && level !== 'none' && <AddPerson level={level} onDone={() => setAdding(false)} />}
    </>
  )
}

// ---------------------------------------------------------------- Security

const idleChoices = [5, 15, 30, 60, 0] as const
const idleLabel = (minutes: number) => (minutes === 0 ? m["protection.idle_never"]() : minutes === 60 ? m["protection.idle_hour"]() : m["protection.idle_minutes"]({ count: minutes }))

export function SecurityPane() {
  const queryClient = useQueryClient()
  const isAdmin = useIsAdmin()
  const { data: status } = useSessionStatus()
  const [next, setNext] = useState<'none' | 'basic' | 'full'>(status?.level ?? 'basic')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['session'] })
  if (!status?.level) return null
  const level = status.level
  const levelText = { none: m["protection.none"](), basic: m["protection.basic"](), full: m["protection.full"]() }
  const levelAbout = { none: m["protection.none_about"](), basic: m["protection.basic_about"](), full: m["protection.full_about"]() }
  const needsSecret = next !== 'none'
  const ready = next !== level && (!needsSecret || secretOk(next, secret))

  const on = next !== 'none'
  const changing = next !== level
  return (
    <>
      <SettingsCard
        title={m["protection.title"]()}
        hint={changing && isAdmin ? m["protection.change_hint"]() : !isAdmin ? m["settings.admin_only"]() : levelAbout[next]}
        onSubmit={async (e) => {
          e.preventDefault()
          if (!ready) return
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
          isAdmin &&
          changing && (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setNext(level); setSecret('') }}>
                {m["protection.cancel"]()}
              </Button>
              <Button type="submit" size="sm" disabled={!ready || busy}>
                {level === 'none' ? m["protection.turn_on"]() : next === 'none' ? m["protection.turn_off"]() : m["protection.apply"]()}
              </Button>
            </>
          )
        }
      >
        <SettingsRow label={m["protection.require"]()}>
          <Switch checked={on} disabled={!isAdmin} onCheckedChange={(checked) => setNext(checked ? (level === 'none' ? 'basic' : level) : 'none')} aria-label={m["protection.require"]()} />
        </SettingsRow>
        {on && (
          <SettingsRow label={m["protection.method"]()}>
            <Segmented
              label={m["protection.method"]()}
              value={next as 'basic' | 'full'}
              onChange={(v) => isAdmin && setNext(v)}
              items={[
                { value: 'basic', label: m["protection.method_pin"]() },
                { value: 'full', label: m["protection.method_full"]() },
              ]}
            />
          </SettingsRow>
        )}
        {isAdmin && needsSecret && changing && (
          <SettingsRow label={next === 'basic' ? m["protection.your_new_pin"]() : m["protection.your_new_password"]()} hint={next === 'full' ? m["protection.full_next_sign_in"]() : m["protection.others_need_new"]()}>
            <SecretInput level={next} value={secret} onChange={setSecret} />
          </SettingsRow>
        )}
      </SettingsCard>

      {level !== 'none' && (
        <SettingsCard title={m["protection.away"]()}>
          <SettingsRow label={m["protection.idle"]()} hint={m["protection.idle_description"]()}>
            <Choose
              value={String(status.idleMinutes)}
              disabled={!isAdmin}
              items={idleChoices.map((c) => ({ value: String(c), label: idleLabel(c) }))}
              onChange={(v) => void setIdleMinutes(Number(v)).then(refresh, (err) => t.error(m["settings.save_failed"](), { description: say(err) }))}
            />
          </SettingsRow>
          <SettingsRow label={m["protection.sign_out_now"]()}>
            <Button size="sm" variant="outline" onClick={() => void signOut().then(refresh)}>
              {m["session.sign_out"]()}
            </Button>
          </SettingsRow>
        </SettingsCard>
      )}

      <IntegrityCard />
    </>
  )
}

/** How the app looks on this computer: light, dark, or following the system,
 * and the language it speaks. Both are this computer's, not the practice's. */
export function AppearancePane() {
  const { theme, setTheme } = useTheme()
  const locale = useLocale()
  return (
    <SettingsCard>
      <SettingsRow label={m["settings.appearance.theme"]()}>
        <Segmented
          label={m["settings.appearance.theme"]()}
          value={(theme ?? 'system') as 'light' | 'dark' | 'system'}
          onChange={(v) => setTheme(v)}
          items={[
            { value: 'light', label: m["settings.appearance.light"]() },
            { value: 'dark', label: m["settings.appearance.dark"]() },
            { value: 'system', label: m["settings.appearance.auto"]() },
          ]}
        />
      </SettingsRow>
      <SettingsRow label={m["settings.appearance.language"]()}>
        <Segmented label={m["settings.appearance.language"]()} value={locale} onChange={(l) => changeLocale(l)} items={selectableLocales.map((l) => ({ value: l, label: localeNames[l] }))} />
      </SettingsRow>
    </SettingsCard>
  )
}

/** Settings > Software update, as on a Mac: the version this computer runs,
 * whether a newer one is out, and whether updates download by themselves.
 * Updates come signed from Pleadli's release feed; the app restarts only
 * when the person says. In a browser there is nothing to update. */
export function UpdatesPane() {
  const u = useUpdateState()
  const auto = autoUpdate()
  if (u.phase === 'unsupported') {
    return (
      <SettingsCard>
        <SettingsRow label={m["update.title"]()} hint={m["update.browser"]()}>
          <span />
        </SettingsRow>
      </SettingsCard>
    )
  }
  const status =
    u.phase === 'checking'
      ? m["update.checking"]()
      : u.phase === 'current'
        ? m["update.current"]()
        : u.phase === 'available'
          ? m["update.available"]({ version: u.version ?? '' })
          : u.phase === 'downloading'
            ? m["update.downloading"]({ percent: String(Math.round(u.progress * 100)) })
            : u.phase === 'ready'
              ? m["update.ready"]({ version: u.version ?? '' })
              : u.phase === 'failed'
                ? m["update.failed"]()
                : m["update.not_checked"]()
  return (
    <>
      <SettingsCard hint={u.phase === 'failed' && u.error ? u.error : u.checkedAt ? m["update.checked_at"]({ time: formatTime(u.checkedAt) }) : undefined}>
        <SettingsRow label={m["update.version"]()}>
          <span className="text-muted-foreground tabular-nums">{u.current ?? '·'}</span>
        </SettingsRow>
        <SettingsRow label={status}>
          {u.phase === 'available' ? (
            <Button size="sm" onClick={() => void downloadUpdate()}>
              {m["update.get"]()}
            </Button>
          ) : u.phase === 'ready' ? (
            <Button size="sm" onClick={() => void restartApp()}>
              {m["update.restart"]()}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={u.phase === 'checking' || u.phase === 'downloading'} onClick={() => void checkNow(true)}>
              {m["update.check"]()}
            </Button>
          )}
        </SettingsRow>
        {u.phase === 'downloading' && (
          <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.08] py-0!">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.round(u.progress * 100)}%` }} />
          </div>
        )}
      </SettingsCard>
      <SettingsCard hint={m["update.auto_hint"]()}>
        <SettingsRow label={m["update.auto"]()}>
          <Switch checked={auto} onCheckedChange={setAutoUpdate} aria-label={m["update.auto"]()} />
        </SettingsRow>
      </SettingsCard>
    </>
  )
}
