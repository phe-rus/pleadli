import { SelectField } from '@/components/form-fields'
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

function failure(title: string, error: unknown) {
  t.error(title, { description: error instanceof ApiError ? error.message : 'Please try again.' })
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
    ? `Locked: ${view.admittedCount} ${view.admittedCount === 1 ? 'person has' : 'people have'} been admitted here. Numbering can only be set before the first admission, so a number on a file never changes meaning.`
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
        onSave={(input) => save.mutate(input, { onSuccess: () => t.success('Numbering saved'), onError: (e) => failure('Could not save numbering', e) })}
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
                      t.success(r.numberingApplied || r.uniformsApplied > 0 ? 'Head Office defaults applied' : 'Already up to date', {
                        description: r.numberingKeptReason ?? undefined,
                      }),
                    onError: (e) => failure('Could not fetch Head Office defaults', e),
                  })
                }
              >
                {fetchDefaults.isPending ? 'Fetching…' : 'Fetch Head Office defaults'}
              </Button>
              <p className="text-xs text-muted-foreground">Numbering is taken only while nobody has been admitted. Colours you set yourself are kept.</p>
            </div>
          ) : null
        }
      />
      <UniformForm
        key={view.uniforms.map((u) => `${u.category}:${u.colour}:${u.label}`).join('|')}
        entries={view.uniforms}
        readOnly={!allowed}
        pending={saveUniforms.isPending}
        onSave={(uniforms) => saveUniforms.mutate(uniforms, { onSuccess: () => t.success('Uniform colours saved'), onError: (e) => failure('Could not save uniform colours', e) })}
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
        heading="Estate default for prisoner numbers"
        intro="Facilities that have not set their own numbering take this when they connect. A facility that has already admitted someone keeps what it has."
        lockedNote={null}
        readOnly={!allowed}
        pending={save.isPending}
        onSave={(input) => save.mutate(input, { onSuccess: () => t.success('Estate numbering saved'), onError: (e) => failure('Could not save numbering', e) })}
        extra={null}
      />
      <UniformForm
        key={policy.uniforms.map((u) => `${u.category}:${u.colour}:${u.label}`).join('|')}
        entries={policy.uniforms}
        readOnly={!allowed}
        pending={saveUniforms.isPending}
        heading="Estate default for uniform colours"
        intro="Shown at facilities that have not chosen their own colour for a category."
        onSave={(uniforms) => saveUniforms.mutate(uniforms, { onSuccess: () => t.success('Estate uniform colours saved'), onError: (e) => failure('Could not save uniform colours', e) })}
      />

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Facilities</h2>
          <p className="text-xs text-muted-foreground">What each facility last reported when it fetched these defaults.</p>
        </div>
        {policy.facilities.length === 0 ? (
          <p className="text-xs text-muted-foreground">No facilities are paired yet.</p>
        ) : (
          <table className="w-full">
            <tbody>
              {policy.facilities.map((f) => (
                <tr key={f.facilityId}>
                  <td className="align-top">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{f.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {f.reportedAt
                          ? `${f.pattern ?? 'No pattern reported'} · ${numberingSourceLabel(f.source)} · reported ${format(f.reportedAt, 'PPp')}`
                          : 'Has not fetched the defaults yet'}
                      </span>
                    </div>
                  </td>
                  <td className="text-right align-top whitespace-nowrap">
                    {f.reportedAt && (f.locked ? <Badge variant="secondary">Locked, in use</Badge> : <Badge variant="outline">Not locked</Badge>)}
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
  heading = 'Prisoner numbers',
  intro = 'How the number written on every new prisoner file is formed. Each admission takes the next number.',
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
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">{heading}</h2>
          <Badge variant={source === 'default' ? 'outline' : 'secondary'}>{numberingSourceLabel(source)}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{intro}</p>
      </div>

      {source === 'default' && (
        <p className="rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 px-3 py-2 text-xs text-foreground">{provisionalNotice}</p>
      )}
      {lockedNote && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <HugeiconsIcon icon={LockKeyIcon} size={14} className="mt-0.5 shrink-0" />
          <span>{lockedNote}</span>
        </div>
      )}

      <form
        className="flex flex-col gap-4 md:max-w-xl"
        onSubmit={(event) => {
          event.preventDefault()
          if (!result.error && dirty) onSave({ pattern: pattern.trim(), reset })
        }}
      >
        <Field>
          <FieldLabel>Pattern</FieldLabel>
          <Input value={pattern} disabled={readOnly} autoComplete="off" spellCheck={false} onChange={(e) => setPattern(e.target.value)} className="font-mono" />
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
          <FieldDescription>Letters, digits, / - . _ and spaces, plus the parts above. At most 40 characters.</FieldDescription>
        </Field>

        <SelectField
          label="Counter"
          value={reset}
          onChange={setReset}
          options={numberingResets}
          placeholder="Choose"
          description="A yearly counter starts again at 1 each January and needs a year in the pattern."
        />

        <div className="flex flex-col gap-1 rounded-md bg-muted/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">Preview</span>
          {result.error ? (
            <span className="text-xs text-destructive">{result.error}</span>
          ) : (
            <span className="flex flex-wrap gap-x-4 font-mono text-sm">
              {result.examples.map((example) => (
                <span key={example}>{example}</span>
              ))}
            </span>
          )}
        </div>

        {!readOnly && (
          <Button type="submit" className="w-fit" disabled={pending || Boolean(result.error) || !dirty}>
            {pending ? 'Saving…' : 'Save numbering'}
          </Button>
        )}
        {extra}
      </form>
    </section>
  )
}

function UniformForm({
  entries,
  readOnly,
  pending,
  heading = 'Uniform colours',
  intro = 'The colour each category of prisoner wears. Nothing is assumed: choose what your facility actually uses.',
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
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">{heading}</h2>
        <p className="text-xs text-muted-foreground">{intro}</p>
      </div>

      <div className="flex flex-col divide-y divide-border/60 md:max-w-xl">
        {draft.map((row) => {
          const entry = entries.find((e) => e.category === row.category)
          return (
            <div key={row.category} className="flex flex-col gap-2 py-3 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{uniformCategoryLabel(row.category)}</span>
                {!row.colour && <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">Not set. Choose a colour</Badge>}
                {showSource && entry?.source === 'head_office' && row.colour && <Badge variant="secondary">Head Office default</Badge>}
              </div>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${uniformCategoryLabel(row.category)} colour`}>
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
                placeholder="Optional label, for example Yellow tunic"
                maxLength={60}
                onChange={(e) => set(row.category, { label: e.target.value })}
              />
            </div>
          )
        })}
      </div>

      {!readOnly && (
        <Button
          type="button"
          className="w-fit"
          disabled={pending || !dirty}
          onClick={() => onSave(draft.map((d) => ({ category: d.category, colour: d.colour, label: d.colour ? d.label.trim() || null : null })))}
        >
          {pending ? 'Saving…' : 'Save colours'}
        </Button>
      )}
    </section>
  )
}
