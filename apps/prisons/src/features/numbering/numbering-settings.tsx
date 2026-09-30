import { SelectField } from '@/components/form-fields'
import { SettingsCard } from '@/components/settings-card'
import { ApiError } from '@/lib/api'
import { useHqConfig, usePermissions } from '@/features/session'
import { LockKeyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'
import { useEstatePolicy, useFetchHeadOfficeDefaults, useNumbering, useSaveEstateNumbering, useSaveEstateUniforms, useSaveNumbering, useSaveUniforms } from './queries'
import {
  numberingResets,
  numberingSourceLabel,
  numberingTokens,
  previewPattern,
  provisionalNotice,
  uniformCategoryLabel,
  uniformPalette,
  type UniformEntry,
  type UniformInput,
} from './schema'
import { m } from '@/paraglide/messages'

function failure(title: string, error: unknown) {
  t.error(title, { description: error instanceof ApiError ? error.message : m.numbering_please_try_again() })
}

/** Settings tab: how prisoner numbers are formed and which colour each category
 * wears. At Head Office it edits the estate default; at a facility, its own. */
export function NumberingSettings() {
  const { data: config } = useHqConfig()
  return config?.isHeadOffice ? <EstateSettings /> : <FacilitySettings />
}

function FacilitySettings() {
  const { data: view } = useNumbering()
  const { data: state } = useHqConfig()
  const { can } = usePermissions()
  const save = useSaveNumbering()
  const saveUniforms = useSaveUniforms()
  const fetchDefaults = useFetchHeadOfficeDefaults()
  const allowed = can('node.manage')

  if (!view) return null
  const lockedNote = view.locked
    ? view.admittedCount === 1
      ? m.numbering_locked_one()
      : m.numbering_locked_many({ count: view.admittedCount })
    : null

  return (
    <div className="flex flex-col gap-10">
      <NumberingForm
        key={`${view.config.pattern}|${view.config.reset}`}
        pattern={view.config.pattern}
        reset={view.config.reset}
        facilityNumber={view.facilityNumber}
        source={view.config.source}
        lockedNote={lockedNote}
        readOnly={!allowed || view.locked}
        pending={save.isPending}
        onSave={(input) => save.mutate(input, { onSuccess: () => t.success(m.numbering_numbering_saved()), onError: (e) => failure(m.numbering_could_not_save_numbering(), e) })}
        extra={
          state?.paired && allowed ? (
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                size="xs"
                variant="secondary"
                className="w-fit"
                disabled={fetchDefaults.isPending}
                onClick={() =>
                  fetchDefaults.mutate(undefined, {
                    onSuccess: (r) =>
                      t.success(r.numberingApplied || r.uniformsApplied > 0 ? m.numbering_head_office_defaults_applied() : m.numbering_already_up_to_date(), {
                        description: r.numberingKeptReason ?? undefined,
                      }),
                    onError: (e) => failure(m.numbering_could_not_fetch_head_office_defaults(), e),
                  })
                }
              >
                {fetchDefaults.isPending ? m.numbering_fetching() : m.numbering_fetch_head_office_defaults()}
              </Button>
              <p>{m.numbering_numbering_is_taken_only_while_nobody()}</p>
            </div>
          ) : null
        }
      />
      <UniformForm
        key={view.uniforms.map((u) => `${u.category}:${u.colour}:${u.label}`).join('|')}
        entries={view.uniforms}
        readOnly={!allowed}
        pending={saveUniforms.isPending}
        onSave={(uniforms) => saveUniforms.mutate(uniforms, { onSuccess: () => t.success(m.numbering_uniform_colours_saved()), onError: (e) => failure(m.numbering_could_not_save_uniform_colours(), e) })}
        showSource
      />
    </div>
  )
}

function EstateSettings() {
  const { data: policy } = useEstatePolicy()
  const { can } = usePermissions()
  const save = useSaveEstateNumbering()
  const saveUniforms = useSaveEstateUniforms()
  const allowed = can('hq.network.manage')

  if (!policy) return null
  return (
    <div className="flex flex-col gap-10">
      <NumberingForm
        key={`${policy.pattern}|${policy.reset}`}
        pattern={policy.pattern}
        reset={policy.reset}
        facilityNumber={null}
        source={policy.updatedAt ? 'head_office' : 'default'}
        heading={m.numbering_estate_default_for_prisoner_numbers()}
        intro={m.numbering_facilities_that_have_not_set_their()}
        lockedNote={null}
        readOnly={!allowed}
        pending={save.isPending}
        onSave={(input) => save.mutate(input, { onSuccess: () => t.success(m.numbering_estate_numbering_saved()), onError: (e) => failure(m.numbering_could_not_save_numbering(), e) })}
        extra={null}
      />
      <UniformForm
        key={policy.uniforms.map((u) => `${u.category}:${u.colour}:${u.label}`).join('|')}
        entries={policy.uniforms}
        readOnly={!allowed}
        pending={saveUniforms.isPending}
        heading={m.numbering_estate_default_for_uniform_colours()}
        intro={m.numbering_shown_at_facilities_that_have_not()}
        onSave={(uniforms) => saveUniforms.mutate(uniforms, { onSuccess: () => t.success(m.numbering_estate_uniform_colours_saved()), onError: (e) => failure(m.numbering_could_not_save_uniform_colours(), e) })}
      />

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3>{m.numbering_facilities()}</h3>
          <p>{m.numbering_what_each_facility_last_reported_when()}</p>
        </div>
        {policy.facilities.length === 0 ? (
          <p>{m.numbering_no_facilities_are_paired_yet()}</p>
        ) : (
          <table className="w-full">
            <tbody>
              {policy.facilities.map((f) => (
                <tr key={f.facilityId}>
                  <td className="align-top">
                    <div className="flex flex-col gap-0.5">
                      <h4>{f.name}</h4>
                      <p>
                        {f.reportedAt
                          ? m.numbering_reported({ pattern: f.pattern ?? m.numbering_no_pattern_reported(), source: numberingSourceLabel(f.source), reportedAt: format(f.reportedAt, 'PPp') })
                          : m.numbering_has_not_fetched_the_defaults_yet()}
                      </p>
                    </div>
                  </td>
                  <td className="text-right align-top whitespace-nowrap">
                    {f.reportedAt && (f.locked ? <Badge variant="secondary">{m.numbering_locked_in_use()}</Badge> : <Badge variant="outline">{m.numbering_not_locked()}</Badge>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function NumberingForm({
  pattern: initialPattern,
  reset: initialReset,
  facilityNumber,
  source,
  heading = m.numbering_prisoner_numbers(),
  intro = m.numbering_how_the_number_written_on_every(),
  lockedNote,
  readOnly,
  pending,
  onSave,
  extra,
}: {
  pattern: string
  reset: string
  facilityNumber: string | null
  source: string
  heading?: string
  intro?: string
  lockedNote: string | null
  readOnly: boolean
  pending: boolean
  onSave: (input: { pattern: string; reset: string }) => void
  extra: React.ReactNode
}) {
  const [pattern, setPattern] = useState(initialPattern)
  const [reset, setReset] = useState(initialReset)
  const result = useMemo(() => previewPattern(pattern, reset, facilityNumber), [pattern, reset, facilityNumber])
  const dirty = pattern !== initialPattern || reset !== initialReset

  return (
    <SettingsCard
      title={heading}
      badge={<Badge variant={source === 'default' ? 'outline' : 'secondary'}>{numberingSourceLabel(source)}</Badge>}
      description={intro}
      onSubmit={(event) => {
        event.preventDefault()
        if (!result.error && dirty) onSave({ pattern: pattern.trim(), reset })
      }}
      hint={extra}
      action={
        readOnly ? undefined : (
          <Button type="submit" size="sm" disabled={pending || Boolean(result.error) || !dirty}>
            {pending ? m.numbering_saving() : m.numbering_save_numbering()}
          </Button>
        )
      }
    >
      {source === 'default' && <p className="rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 px-3 py-2">{provisionalNotice()}</p>}
      {lockedNote && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <HugeiconsIcon icon={LockKeyIcon} size={14} className="mt-0.5 shrink-0" />
          <p>{lockedNote}</p>
        </div>
      )}

      <Field>
        <FieldLabel>{m.numbering_pattern()}</FieldLabel>
        <Input value={pattern} disabled={readOnly} autoComplete="off" spellCheck={false} onChange={(e) => setPattern(e.target.value)} />
        {!readOnly && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {numberingTokens.map((item) => (
              <button
                key={item.token}
                type="button"
                title={item.meaning}
                onClick={() => setPattern((p) => `${p}${item.token}`)}
                className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                {item.token}
              </button>
            ))}
          </div>
        )}
        <FieldDescription>{m.numbering_letters_digits_and_spaces_plus_the()}</FieldDescription>
      </Field>

      <SelectField
        label={m.numbering_counter()}
        value={reset}
        onChange={setReset}
        options={numberingResets}
        placeholder={m.numbering_choose()}
        description={m.numbering_a_yearly_counter_starts_again_at()}
      />

      <div className="flex flex-col gap-1 rounded-md bg-muted/40 px-3 py-2">
        <h4>{m.numbering_preview()}</h4>
        {result.error ? (
          <p className="text-destructive">{result.error}</p>
        ) : (
          <p className="flex flex-wrap gap-x-4">
            {result.examples.map((example) => (
              <code key={example}>{example}</code>
            ))}
          </p>
        )}
      </div>
    </SettingsCard>
  )
}

function UniformForm({
  entries,
  readOnly,
  pending,
  heading = m.numbering_uniform_colours(),
  intro = m.numbering_the_colour_each_category_of_prisoner(),
  onSave,
  showSource = false,
}: {
  entries: UniformEntry[]
  readOnly: boolean
  pending: boolean
  heading?: string
  intro?: string
  onSave: (uniforms: UniformInput[]) => void
  showSource?: boolean
}) {
  const [draft, setDraft] = useState(() => entries.map((e) => ({ category: e.category, colour: e.colour, label: e.label ?? '' })))
  const dirty = draft.some((d, i) => d.colour !== entries[i]?.colour || d.label.trim() !== (entries[i]?.label ?? ''))
  const set = (category: string, patch: Partial<{ colour: string | null; label: string }>) =>
    setDraft((rows) => rows.map((row) => (row.category === category ? { ...row, ...patch } : row)))

  return (
    <SettingsCard
      title={heading}
      description={intro}
      action={
        readOnly ? undefined : (
          <Button
            type="button"
            size="sm"
            disabled={pending || !dirty}
            onClick={() => onSave(draft.map((d) => ({ category: d.category, colour: d.colour, label: d.colour ? d.label.trim() || null : null })))}
          >
            {pending ? m.numbering_saving() : m.numbering_save_colours()}
          </Button>
        )
      }
    >
      <div className="flex flex-col divide-y divide-border/60">
        {draft.map((row) => {
          const entry = entries.find((e) => e.category === row.category)
          return (
            <div key={row.category} className="flex flex-col gap-2 py-3 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4>{uniformCategoryLabel(row.category)}</h4>
                {!row.colour && <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">{m.numbering_not_set_choose_a_colour()}</Badge>}
                {showSource && entry?.source === 'head_office' && row.colour && <Badge variant="secondary">{m.numbering_head_office_default()}</Badge>}
              </div>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={m.numbering_colour({ category: uniformCategoryLabel(row.category) })}>
                {uniformPalette.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={row.colour === c.value}
                    disabled={readOnly}
                    onClick={() => set(row.category, { colour: row.colour === c.value ? null : c.value })}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors disabled:pointer-events-none disabled:opacity-60',
                      row.colour === c.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60',
                    )}
                  >
                    <span className={cn('size-3 rounded-full ring-1 ring-border', c.dot)} />
                    {c.label}
                  </button>
                ))}
              </div>
              <Input
                value={row.label}
                disabled={readOnly || !row.colour}
                autoComplete="off"
                placeholder={m.numbering_optional_label_for_example_yellow_tunic()}
                maxLength={60}
                onChange={(e) => set(row.category, { label: e.target.value })}
              />
            </div>
          )
        })}
      </div>

    </SettingsCard>
  )
}
