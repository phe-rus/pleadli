import { findUsage, suggestedUsages, usages, type Usage } from '@/features/usages'
import type { PracticeKind, Setting, StaffRole } from '@/features/installation'
import * as m from '@/paraglide/messages'
import { Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChoiceCard, Chip, StepHeader, TextField, type ExtraStep, type ExtraStepContext, type SetupRole, type SetupState } from '@pleadli/setup'
import { cn } from '@pleadli/ui/lib/utils'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'

/** What the practice's own steps collect. It reaches the backend as
 * `payload.extra` (`PracticeInput` in `installation.rs`). */
export type PracticeAnswers = {
  setting: Setting
  practiceKind: PracticeKind
  usages: Usage[]
  /** The ticks were changed by hand: a new kind of practice no longer replaces them. */
  usagesTouched: boolean
}

export const practiceOf = (state: SetupState) => state.extra as PracticeAnswers

export function initialPractice(hasMatters: boolean): PracticeAnswers {
  const suggested = [...suggestedUsages.private]
  // An older copy only ever held criminal defence: keep it on (decision D2).
  return { setting: 'alone', practiceKind: 'private', usages: hasMatters && !suggested.includes('criminal') ? [...suggested, 'criminal'] : suggested, usagesTouched: hasMatters }
}

export const roles: readonly SetupRole[] = [
  { id: 'advocate', label: () => m["staff.role.advocate"]() },
  { id: 'paralegal', label: () => m["staff.role.paralegal"]() },
  { id: 'accounts', label: () => m["staff.role.accounts"]() },
]

const settingText: Record<Setting, { title: () => string; body: () => string }> = {
  alone: { title: () => m["setup.setting.alone"](), body: () => m["setup.setting.alone_body"]() },
  firm: { title: () => m["setup.setting.firm"](), body: () => m["setup.setting.firm_body"]() },
}

export const practiceKindText: Record<PracticeKind, { title: () => string; body: () => string }> = {
  private: { title: () => m["setup.kind.private"](), body: () => m["setup.kind.private_body"]() },
  government: { title: () => m["setup.kind.government"](), body: () => m["setup.kind.government_body"]() },
  in_house: { title: () => m["setup.kind.in_house"](), body: () => m["setup.kind.in_house_body"]() },
  legal_aid: { title: () => m["setup.kind.legal_aid"](), body: () => m["setup.kind.legal_aid_body"]() },
}

const whoText: Record<Exclude<StaffRole, 'accounts'>, { title: () => string; body: () => string }> = {
  advocate: { title: () => m["setup.who.advocate"](), body: () => m["setup.who.advocate_body"]() },
  paralegal: { title: () => m["setup.who.paralegal"](), body: () => m["setup.who.paralegal_body"]() },
}

function nameLabel(p: PracticeAnswers) {
  if (p.practiceKind === 'government') return m["setup.name.office"]()
  if (p.practiceKind === 'in_house') return m["setup.name.department"]()
  return p.setting === 'alone' ? m["setup.name.chambers"]() : m["setup.name.firm"]()
}

function PracticeStep({ locale, country, state, update }: ExtraStepContext) {
  const practice = practiceOf(state)
  const setPractice = (patch: Partial<PracticeAnswers>) => {
    const next = { ...practice, ...patch }
    if (patch.practiceKind && !practice.usagesTouched) next.usages = [...suggestedUsages[patch.practiceKind]]
    update({ extra: next, ...(patch.setting === 'alone' ? { people: [] } : {}) })
  }
  const regions = country.regions.map((r) => ({ value: r, label: r }))
  return (
    <div>
      <StepHeader title={m["setup.practice.title"]()} lead={m["setup.practice.lead"]()} />
      <div className="flex flex-col gap-10">

      <section className="flex flex-col gap-3">
        <h2>{m["setup.practice.setting"]()}</h2>
        <div role="radiogroup" aria-label={m["setup.practice.setting"]()} className="grid gap-3 sm:grid-cols-2">
          {(['alone', 'firm'] as const).map((s) => (
            <ChoiceCard key={s} selected={practice.setting === s} onSelect={() => setPractice({ setting: s })} title={settingText[s].title()} body={settingText[s].body()} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2>{m["setup.practice.kind"]()}</h2>
        <div role="radiogroup" aria-label={m["setup.practice.kind"]()} className="flex flex-col gap-3">
          {(['private', 'government', 'in_house', 'legal_aid'] as const).map((k) => (
            <ChoiceCard key={k} selected={practice.practiceKind === k} onSelect={() => setPractice({ practiceKind: k })} title={practiceKindText[k].title()} body={practiceKindText[k].body()} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2>{m["setup.practice.who"]()}</h2>
        <div role="radiogroup" aria-label={m["setup.practice.who"]()} className="grid gap-3 sm:grid-cols-2">
          {(['advocate', 'paralegal'] as const).map((r) => (
            <ChoiceCard key={r} selected={state.admin.role === r} onSelect={() => update({ admin: { ...state.admin, role: r } })} title={whoText[r].title()} body={whoText[r].body()} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <TextField label={nameLabel(practice)} placeholder={m["setup.name.placeholder"]()} value={state.officeName} onChange={(e) => update({ officeName: e.target.value })} />
        {regions.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span>{country.regionLabel[locale]}</span>
            <Select items={regions} value={state.region || null} onValueChange={(v) => update({ region: v ?? '' })}>
              <SelectTrigger className="h-10 w-full rounded-lg px-3 data-[size=default]:h-10">
                <SelectValue placeholder={m["setup.region_choose"]()} />
              </SelectTrigger>
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
          <TextField label={country.regionLabel[locale]} value={state.region} onChange={(e) => update({ region: e.target.value })} />
        )}
      </section>
      </div>
    </div>
  )
}

/** A kind of work to tick. The whole card is the target. */
export function UsageToggle({ id, checked, onToggle }: { id: Usage; checked: boolean; onToggle: () => void }) {
  const usage = findUsage(id)
  if (!usage) return null
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all outline-none',
        'hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/40',
        checked ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-sm' : 'border-border',
      )}
    >
      <HugeiconsIcon icon={usage.icon} className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <strong>{usage.label()}</strong>
          {usage.status !== 'ready' && <Chip tone="warn">{usage.status === 'provisional' ? m["usage.status.provisional"]() : m["usage.status.research"]()}</Chip>}
        </span>
        <span className="text-muted-foreground">{usage.adds()}</span>
      </span>
      <span aria-hidden className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
        {checked && <HugeiconsIcon icon={Tick02Icon} className="size-3.5" strokeWidth={2.5} />}
      </span>
    </button>
  )
}

function UsagesStep({ state, update }: ExtraStepContext) {
  const practice = practiceOf(state)
  const toggle = (id: Usage) => {
    const next = practice.usages.includes(id) ? practice.usages.filter((u) => u !== id) : [...practice.usages, id]
    update({ extra: { ...practice, usages: next, usagesTouched: true } })
  }
  return (
    <div className="flex flex-col">
      <StepHeader title={m["setup.usages.title"]()} lead={m["setup.usages.lead"]()} />
      <div className="grid gap-3">
        {usages.map((u) => (
          <UsageToggle key={u.id} id={u.id} checked={practice.usages.includes(u.id)} onToggle={() => toggle(u.id)} />
        ))}
      </div>
      {practice.usages.length === 0 && <p className="pt-4 text-muted-foreground">{m["setup.usages.none"]()}</p>}
    </div>
  )
}

export const practiceSteps: readonly ExtraStep[] = [
  { id: 'practice', replaces: 'model', render: (ctx) => <PracticeStep {...ctx} />, canContinue: ({ state }) => state.officeName.trim().length > 0 },
  { id: 'usages', after: 'model', render: (ctx) => <UsagesStep {...ctx} />, canContinue: ({ state }) => practiceOf(state).usages.length > 0 },
]

/** The lines setup's closing summary adds for the practice. */
export function practiceSummary({ state }: ExtraStepContext): readonly [string, string][] {
  const p = practiceOf(state)
  return [
    [m["setup.summary.practice"](), `${settingText[p.setting].title()} · ${practiceKindText[p.practiceKind].title()}`],
    [m["setup.summary.you"](), roles.find((r) => r.id === state.admin.role)?.label() ?? ''],
    [m["setup.summary.usages"](), p.usages.map((u) => findUsage(u)?.label() ?? u).join(', ')],
  ]
}
