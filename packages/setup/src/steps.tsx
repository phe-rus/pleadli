import { Add01Icon, Delete02Icon, LockKeyIcon, ShieldUserIcon, SquareUnlock02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { cn } from '@pleadli/ui/lib/utils'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ACCENTS, applyAccent, findAccent } from './accents'
import { COUNTRIES, countryReadiness, findCountry, type Country, type InstitutionPack } from './jurisdictions'
import { LICENCE, LICENCE_VERSION } from './licence'
import { LANGUAGE_NAMES, type SetupMessages } from './messages'
import { ChoiceCard, Chip, StepHeader, TextField } from './parts'
import { secretProblem, type SetupRole, type SetupState } from './setup-flow'
import { LOCALES, type Institution, type Locale, type Model, type PackStatus, type PersonDraft, type Protection, type SecondFactorEnrolment } from './types'

type T = { t: SetupMessages }

// ---------------------------------------------------------------- welcome

export function WelcomeStep({ t, institution, productName, logo, action }: T & { institution: Institution; productName: string; logo: string; action?: ReactNode }) {
  const intro = t.intro[institution]
  const rows = [
    { title: t.what_title, body: intro.what },
    { title: t.never_title, body: intro.never },
    { title: t.data_title, body: t.data_body },
  ]
  return (
    <div className="flex flex-col items-center gap-8 pt-6 text-center">
      <img src={logo} alt="" className="size-24 object-contain" draggable={false} />
      <div className="flex flex-col gap-2">
        <h1>{t.welcome_title(productName)}</h1>
        <p className="text-muted-foreground">{t.welcome_lead}</p>
      </div>
      <ul className="not-typeset flex w-full list-none flex-col gap-3 p-0 text-left">
        {rows.map((row) => (
          <li key={row.title} className="rounded-xl border border-border bg-card p-4">
            <h3>{row.title}</h3>
            <p className="text-muted-foreground">{row.body}</p>
          </li>
        ))}
      </ul>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------- licence

export function LicenceStep({ t, locale, accepted, onAccept }: T & { locale: Locale; accepted: boolean; onAccept: (v: boolean) => void }) {
  const text = LICENCE[locale]
  const box = useRef<HTMLDivElement>(null)
  const [readToEnd, setReadToEnd] = useState(accepted)
  const id = useId()

  const check = () => {
    const el = box.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 16) setReadToEnd(true)
  }
  useEffect(check, [locale])

  return (
    <div className="flex flex-col">
      <StepHeader title={t.licence_title} lead={t.licence_lead} />
      <div ref={box} onScroll={check} className="max-h-[46vh] overflow-y-auto rounded-xl border border-border bg-card p-5" tabIndex={0}>
        <article className="flex flex-col gap-4">
          <header className="flex items-baseline justify-between gap-4">
            <h2>{text.title}</h2>
            <span className="text-muted-foreground">{t.licence_version(LICENCE_VERSION)}</span>
          </header>
          {text.sections.map((s) => (
            <section key={s.heading} className="flex flex-col gap-1">
              <h3>{s.heading}</h3>
              <p>{s.body}</p>
            </section>
          ))}
        </article>
      </div>
      <div className="flex items-start gap-3 pt-5">
        <Checkbox id={id} checked={accepted} disabled={!readToEnd} onCheckedChange={(v) => onAccept(v === true)} className="mt-0.5" />
        <label htmlFor={id} className={cn(!readToEnd && 'text-muted-foreground')}>
          {t.licence_accept}
          {!readToEnd && <span className="block text-muted-foreground">{t.licence_scroll}</span>}
        </label>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- where

function statusChip(t: SetupMessages, status: PackStatus) {
  if (status === 'ready') return <Chip tone="good">{t.status_ready}</Chip>
  if (status === 'provisional') return <Chip tone="warn">{t.status_provisional}</Chip>
  return <Chip>{t.status_research}</Chip>
}

const statusHint = (t: SetupMessages, status: PackStatus) =>
  status === 'ready' ? t.status_hint_ready : status === 'provisional' ? t.status_hint_provisional : t.status_hint_research

export function WhereStep({
  t,
  locale,
  jurisdiction,
  language,
  onCountry,
  onLanguage,
}: T & { locale: Locale; jurisdiction: string; language: Locale; onCountry: (code: string) => void; onLanguage: (l: Locale) => void }) {
  const country = COUNTRIES.find((c) => c.code === jurisdiction)
  const areas = [
    { id: 'east_africa' as const, label: t.area_east_africa },
    { id: 'europe' as const, label: t.area_europe },
  ]
  const local = country?.languages ?? []
  const other = LOCALES.filter((l) => !local.includes(l))
  return (
    <div className="flex flex-col gap-10">
      <div>
        <StepHeader title={t.where_title} lead={t.where_lead} />
        <div className="flex flex-col gap-6">
          {areas.map((area) => (
            <section key={area.id} className="flex flex-col gap-2">
              <h2 className="text-muted-foreground">{area.label}</h2>
              <div role="radiogroup" aria-label={area.label} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {COUNTRIES.filter((c) => c.area === area.id).map((c) => (
                  <ChoiceCard key={c.code} selected={c.code === jurisdiction} onSelect={() => onCountry(c.code)} title={c.name[locale]} badge={statusChip(t, countryReadiness(c))} />
                ))}
              </div>
            </section>
          ))}
          {country && <p className="text-muted-foreground">{statusHint(t, countryReadiness(country))}</p>}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2>{t.language_title}</h2>
          <p className="text-muted-foreground">{t.language_lead}</p>
        </div>
        <div role="radiogroup" aria-label={t.language_title} className="grid grid-cols-2 gap-2">
          {[...local, ...other].map((l) => (
            <ChoiceCard
              key={l}
              selected={l === language}
              onSelect={() => onLanguage(l)}
              title={<span lang={l}>{LANGUAGE_NAMES[l]}</span>}
              body={country && local.includes(l) ? t.language_used_in(country.name[locale]) : undefined}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- model

export function ModelStep({
  t,
  locale,
  country,
  pack,
  model,
  officeName,
  region,
  onModel,
  onOfficeName,
  onRegion,
}: T & {
  locale: Locale
  country: Country
  pack: InstitutionPack | undefined
  model: Model
  officeName: string
  region: string
  onModel: (m: Model) => void
  onOfficeName: (v: string) => void
  onRegion: (v: string) => void
}) {
  const hasHq = !!pack?.headquarters
  const regions = country.regions.map((r) => ({ value: r, label: r }))
  return (
    <div className="flex flex-col gap-8">
      <StepHeader title={t.model_title} lead={t.model_lead} />
      <div role="radiogroup" aria-label={t.model_title} className="flex flex-col gap-3">
        <ChoiceCard selected={model === 'office'} onSelect={() => onModel('office')} title={t.office_title} body={t.office_body} />
        <ChoiceCard selected={model === 'headquarters'} onSelect={() => onModel('headquarters')} disabled={!hasHq} title={t.hq_title} body={hasHq ? t.hq_body : t.hq_unavailable} />
      </div>

      <div className="flex flex-col gap-4">
        <TextField
          label={model === 'headquarters' ? t.hq_name : t.office_name}
          placeholder={model === 'headquarters' ? pack?.headquarters ?? '' : t.office_name_placeholder}
          value={officeName}
          onChange={(e) => onOfficeName(e.target.value)}
          autoFocus
        />
        {model === 'office' &&
          (regions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span>{country.regionLabel[locale]}</span>
              <Select items={regions} value={region || null} onValueChange={(v) => onRegion(v ?? '')}>
                <SelectTrigger className="h-10 w-full rounded-lg px-3 data-[size=default]:h-10">
                  <SelectValue placeholder={t.region_choose} />
                </SelectTrigger>
                {/* The field sits low on the page: the list opens upwards and
                    stays short so it never covers Continue. */}
                <SelectContent side="top" alignItemWithTrigger={false} className="max-h-72">
                  <SelectGroup>
                    {regions.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <TextField label={country.regionLabel[locale]} placeholder={t.region_type} hint={t.optional} value={region} onChange={(e) => onRegion(e.target.value)} />
          ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- protection

export function ProtectionStep({ t, protection, onProtection }: T & { protection: Protection; onProtection: (p: Protection) => void }) {
  const options = [
    { id: 'none' as const, icon: SquareUnlock02Icon, title: t.none_title, body: t.none_body },
    { id: 'basic' as const, icon: LockKeyIcon, title: t.basic_title, body: t.basic_body, recommended: true },
    { id: 'full' as const, icon: ShieldUserIcon, title: t.full_title, body: t.full_body },
  ]
  return (
    <div className="flex flex-col gap-6">
      <StepHeader title={t.protection_title} lead={t.protection_lead} />
      <div role="radiogroup" aria-label={t.protection_title} className="flex flex-col gap-3">
        {options.map((o) => (
          <ChoiceCard
            key={o.id}
            selected={protection === o.id}
            onSelect={() => onProtection(o.id)}
            title={
              <span className="flex items-center gap-2">
                <HugeiconsIcon icon={o.icon} className="size-4.5" />
                {o.title}
              </span>
            }
            badge={o.recommended ? <Chip tone="good">{t.recommended}</Chip> : undefined}
            body={o.body}
          />
        ))}
      </div>
      <p className="text-muted-foreground">{t.always_encrypted}</p>
    </div>
  )
}

// ---------------------------------------------------------------- look

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

export function LookStep({
  t,
  locale,
  productName,
  officeName,
  logo,
  defaultLogo,
  accent,
  onLogo,
  onAccent,
}: T & {
  locale: Locale
  productName: string
  officeName: string
  logo: string | null
  defaultLogo: string
  accent: string
  onLogo: (v: string | null) => void
  onAccent: (v: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [failed, setFailed] = useState(false)
  // The whole window takes the colour as it is chosen, not only the preview.
  useEffect(() => applyAccent(accent), [accent])

  return (
    <div className="flex flex-col gap-8">
      <StepHeader title={t.look_title} lead={t.look_lead} />

      <section className="flex items-center gap-5">
        <div className="flex size-24 shrink-0 items-center justify-center rounded-2xl border border-border bg-white p-3">
          <img src={logo ?? defaultLogo} alt="" className="size-full object-contain" draggable={false} />
        </div>
        <div className="flex flex-col gap-2">
          <strong>{t.logo}</strong>
          <p className="text-muted-foreground">{t.logo_hint}</p>
          <div className="flex gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  onLogo(await readLogo(file))
                  setFailed(false)
                } catch {
                  setFailed(true)
                }
              }}
            />
            <Button variant="outline" size="lg" className="h-9 rounded-lg px-3" onClick={() => input.current?.click()}>
              {t.logo_upload}
            </Button>
            {logo && (
              <Button variant="ghost" size="lg" className="h-9 rounded-lg px-3" onClick={() => onLogo(null)}>
                {t.logo_default}
              </Button>
            )}
          </div>
          {failed && (
            <p role="alert" className="not-typeset text-destructive">
              {t.logo_failed}
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <strong>{t.colour}</strong>
        <div role="radiogroup" aria-label={t.colour} className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={a.id === accent}
              aria-label={a.name[locale]}
              title={a.name[locale]}
              onClick={() => onAccent(a.id)}
              className={cn(
                'size-9 rounded-full ring-offset-2 ring-offset-background transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring',
                a.id === accent && 'ring-2 ring-foreground',
              )}
              style={{ background: a.light.primary }}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <strong>{t.preview}</strong>
        <div className="flex overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex w-44 flex-col gap-3 border-r border-border bg-sidebar p-3">
            <div className="flex items-center gap-2">
              <img src={logo ?? defaultLogo} alt="" className="size-6 object-contain" />
              <span className="truncate">{officeName || productName}</span>
            </div>
            <span className="rounded-md bg-sidebar-primary px-2 py-1 text-sidebar-primary-foreground">{productName}</span>
            <span className="h-2 w-24 rounded bg-muted" />
            <span className="h-2 w-20 rounded bg-muted" />
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <span className="h-3 w-40 rounded bg-muted" />
            <span className="h-2 w-56 rounded bg-muted" />
            <span className="h-2 w-48 rounded bg-muted" />
            <div>
              <Button size="lg" className="h-9 px-4">
                {t.preview_button}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- people

function SecretFields({
  t,
  protection,
  value,
  confirm,
  onValue,
  onConfirm,
}: T & { protection: Protection; value: string; confirm?: string; onValue: (v: string) => void; onConfirm?: (v: string) => void }) {
  const pin = protection === 'basic'
  const problem = value ? secretProblem(protection, value) : null
  const mismatch = onConfirm && confirm && confirm !== value
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextField
        label={pin ? t.pin : t.password}
        type="password"
        inputMode={pin ? 'numeric' : undefined}
        maxLength={pin ? 6 : undefined}
        autoComplete="new-password"
        value={value}
        onChange={(e) => onValue(pin ? e.target.value.replace(/\D/g, '') : e.target.value)}
        hint={pin ? t.pin_hint : t.password_hint}
        error={problem ? t[problem] : undefined}
      />
      {onConfirm && (
        <TextField
          label={t.confirm}
          type="password"
          inputMode={pin ? 'numeric' : undefined}
          maxLength={pin ? 6 : undefined}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirm(pin ? e.target.value.replace(/\D/g, '') : e.target.value)}
          error={mismatch ? t.mismatch : undefined}
        />
      )}
    </div>
  )
}

function SecondFactor({
  t,
  name,
  enrolment,
  code,
  onEnrolment,
  onCode,
  request,
}: T & {
  name: string
  enrolment: SecondFactorEnrolment | null
  code: string
  onEnrolment: (e: SecondFactorEnrolment) => void
  onCode: (c: string) => void
  request: (name: string) => Promise<SecondFactorEnrolment>
}) {
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (enrolment || busy || !name.trim()) return
    setBusy(true)
    request(name.trim())
      .then((e) => {
        onEnrolment(e)
        setFailed(false)
      })
      .catch(() => setFailed(true))
      .finally(() => setBusy(false))
    // Asked for once per person; a new name after that keeps the same key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrolment, name])

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <strong>{t.factor_title}</strong>
        <p className="text-muted-foreground">{t.factor_lead}</p>
      </div>
      {failed && (
        <p role="alert" className="not-typeset text-destructive">
          {t.factor_failed}
        </p>
      )}
      {enrolment && (
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <div className="size-40 shrink-0 rounded-lg bg-white p-2 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: enrolment.svg }} />
          <div className="flex flex-1 flex-col gap-3">
            <div>
              <span className="text-muted-foreground">{t.factor_manual}</span>
              <code className="block break-all select-all">{enrolment.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
            </div>
            <TextField
              label={t.factor_code}
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => onCode(e.target.value.replace(/\D/g, ''))}
              error={code && code.length !== 6 ? t.factor_code_invalid : undefined}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function RoleSelect({ roles, value, onValue, label }: { roles: readonly SetupRole[]; value: string; onValue: (v: string) => void; label: string }) {
  const items = roles.map((r) => ({ value: r.id, label: r.label() }))
  return (
    <div className="flex flex-col gap-1.5">
      <span>{label}</span>
      <Select items={items} value={value} onValueChange={(v) => onValue(v ?? value)}>
        <SelectTrigger className="h-10 w-full rounded-lg px-3 data-[size=default]:h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

export function PeopleStep({
  t,
  state,
  update,
  roles,
  adminRole,
  personFlag,
  ranks,
  requestSecondFactor,
  allowOthers = true,
}: T & {
  state: SetupState
  update: (patch: Partial<SetupState>) => void
  roles: readonly SetupRole[]
  adminRole: string
  personFlag?: { label: (country: Country | undefined) => string; hint?: (country: Country | undefined) => string }
  ranks: readonly string[]
  requestSecondFactor: (name: string) => Promise<SecondFactorEnrolment>
  /** False when the app has only one person (Lawyers: working alone). */
  allowOthers?: boolean
}) {
  const rankList = useId()
  const flagId = useId()
  const a = state.admin
  const setAdmin = (patch: Partial<SetupState['admin']>) => update({ admin: { ...a, ...patch } })
  const setPerson = (i: number, patch: Partial<PersonDraft>) => update({ people: state.people.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const otherRoles = roles.filter((r) => r.id !== adminRole)
  const secretReady = state.protection === 'full' && a.name.trim() && !secretProblem('full', a.secret) && a.secret === a.confirm

  return (
    <div className="flex flex-col gap-10">
      <StepHeader title={t.people_title} lead={t.people_lead} />
      <datalist id={rankList}>
        {ranks.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <section className="flex flex-col gap-4">
        <div>
          <h2>{t.admin_title}</h2>
          <p className="text-muted-foreground">{t.admin_lead}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label={t.name} value={a.name} onChange={(e) => setAdmin({ name: e.target.value })} autoComplete="name" autoFocus />
          <TextField label={t.rank} value={a.rank} onChange={(e) => setAdmin({ rank: e.target.value })} list={rankList} />
        </div>
        {personFlag && (
          <div className="flex items-start gap-3">
            <Checkbox id={flagId} checked={a.flag} onCheckedChange={(v) => setAdmin({ flag: v === true })} className="mt-0.5" />
            <label htmlFor={flagId}>
              {personFlag.label(findCountry(state.jurisdiction))}
              {personFlag.hint && <span className="block text-muted-foreground">{personFlag.hint(findCountry(state.jurisdiction))}</span>}
            </label>
          </div>
        )}
        {state.protection !== 'none' && (
          <SecretFields
            t={t}
            protection={state.protection}
            value={a.secret ?? ''}
            confirm={a.confirm}
            onValue={(secret) => setAdmin({ secret })}
            onConfirm={(confirm) => setAdmin({ confirm })}
          />
        )}
        {secretReady && (
          <SecondFactor
            t={t}
            name={a.name}
            enrolment={state.enrolment}
            code={state.factorCode}
            onEnrolment={(enrolment) => update({ enrolment })}
            onCode={(factorCode) => update({ factorCode })}
            request={requestSecondFactor}
          />
        )}
      </section>

      {allowOthers && (
      <section className="flex flex-col gap-4">
        <div>
          <h2>{t.others_title}</h2>
          <p className="text-muted-foreground">{state.protection === 'none' ? t.others_none : t.others_lead}</p>
        </div>
        {state.protection !== 'none' && (
          <>
            {state.people.map((p, i) => (
              <div key={i} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField label={t.name} value={p.name} onChange={(e) => setPerson(i, { name: e.target.value })} error={!p.name.trim() ? t.name_required : undefined} />
                  <TextField label={t.rank} value={p.rank} onChange={(e) => setPerson(i, { rank: e.target.value })} list={rankList} />
                </div>
                {otherRoles.length > 0 && <RoleSelect roles={roles} value={p.role} onValue={(role) => setPerson(i, { role })} label={t.role} />}
                <SecretFields t={t} protection={state.protection} value={p.secret ?? ''} onValue={(secret) => setPerson(i, { secret })} />
                {state.protection === 'full' && <p className="text-muted-foreground">{t.first_sign_in}</p>}
                <div>
                  <Button variant="ghost" size="lg" className="h-9 px-3 text-destructive" onClick={() => update({ people: state.people.filter((_, j) => j !== i) })}>
                    <HugeiconsIcon icon={Delete02Icon} />
                    {t.remove}
                  </Button>
                </div>
              </div>
            ))}
            <div>
              <Button
                variant="outline"
                size="lg"
                className="h-10 rounded-lg px-4"
                onClick={() => update({ people: [...state.people, { name: '', rank: '', role: otherRoles[0]?.id ?? adminRole, flag: false, secret: '' }] })}
              >
                <HugeiconsIcon icon={Add01Icon} />
                {t.add_person}
              </Button>
            </div>
          </>
        )}
      </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- done

export function DoneStep({
  t,
  locale,
  state,
  country,
  productName,
  defaultLogo,
  showModel = true,
  extraRows = [],
}: T & { locale: Locale; state: SetupState; country: Country; productName: string; defaultLogo: string; showModel?: boolean; extraRows?: readonly [string, ReactNode][] }) {
  const protection = { none: t.none_title, basic: t.basic_title, full: t.full_title }[state.protection]
  const accent = findAccent(state.accent)
  const rows: [string, ReactNode][] = [
    [t.summary_country, country.name[locale]],
    [t.summary_language, LANGUAGE_NAMES[state.language]],
    ...(showModel ? [[t.summary_model, state.model === 'headquarters' ? t.hq_title : t.office_title] as [string, ReactNode]] : []),
    ...extraRows,
    [t.summary_office, [state.officeName, state.model === 'office' ? state.region : ''].filter(Boolean).join(', ')],
    [t.summary_protection, protection],
    [t.people_title, t.summary_people(1 + state.people.length)],
    [
      t.colour,
      accent && (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="size-3.5 rounded-full" style={{ background: accent.light.primary }} />
          {accent.name[locale]}
        </span>
      ),
    ],
  ]
  return (
    <div className="flex flex-col items-center gap-8 pt-6 text-center">
      <img src={state.logo ?? defaultLogo} alt={productName} className="size-20 object-contain" draggable={false} />
      <div className="flex flex-col gap-2">
        <h1>{t.done_title}</h1>
        <p className="text-muted-foreground">{t.done_lead}</p>
      </div>
      <table className="w-full text-left">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-border/60 last:border-0">
              <th scope="row" className="py-2.5 pr-4 font-normal text-muted-foreground">
                {k}
              </th>
              <td className="py-2.5">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
