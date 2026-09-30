import * as m from '@/paraglide/messages'
import { CasePicker } from '@/components/case-picker'
import { personFullName } from '@/features/people'
import { ArrowLeft01Icon, ArrowRight01Icon, FileImportIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { isTauri } from '@tauri-apps/api/core'
import { useMemo, useRef, useState } from 'react'
import {
  useBulkImport,
  useImportFields,
  useParseImportFile,
  useResolveCases,
  useResolvePeople,
} from './queries'
import { importableEntityTypes, isCaseRefField, isPersonRefField } from './schema'
import type { BulkImportResult, CaseResolution, ImportableEntityType, ImportField, ImportPreview, PersonResolution } from './schema'

type Step = 'type' | 'file' | 'mapping' | 'resolving' | 'preview' | 'result'

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** A best-effort starting guess for each field's spreadsheet column, by
 * loose name matching — the officer sees and can change every guess in
 * the mapping step, so a wrong guess costs a click, not a bad import. */
function guessMapping(fields: ImportField[], headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {}
  for (const f of fields) {
    const normalizedLabel = normalize(f.label)
    const normalizedKey = normalize(f.key)
    const match = headers.find((h) => {
      const nh = normalize(h)
      return nh === normalizedLabel || nh === normalizedKey || nh.includes(normalizedKey) || normalizedKey.includes(nh)
    })
    mapping[f.key] = match ?? null
  }
  return mapping
}

function cellValue(row: string[], headers: string[], headerName: string | null) {
  if (!headerName) return ''
  const index = headers.indexOf(headerName)
  return index === -1 ? '' : (row[index]?.trim() ?? '')
}

function personKey(firstName: string, lastName: string, nationalId: string) {
  return `${normalize(firstName)}|${normalize(lastName)}|${normalize(nationalId)}`
}

type PersonTuple = { key: string; firstName: string; lastName: string; nationalId: string }

function StepHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

/** Bulk structured import — lives in Settings → Data. Officer picks a
 * record type, then a CSV/Excel file; each detected column is mapped to
 * a real field (or ignored); any person/case reference is resolved
 * against existing records, confirmed by the officer, never guessed
 * silently; only then does anything actually get created, one row at a
 * time through the same path a hand-typed record would take. */
export function ImportWizard() {
  const [step, setStep] = useState<Step>('type')
  const [entityType, setEntityType] = useState<ImportableEntityType | ''>('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [personResolutions, setPersonResolutions] = useState<Map<string, PersonResolution>>(new Map())
  const [personChoices, setPersonChoices] = useState<Record<string, string>>({}) // tuple key -> personId | 'new'
  const [caseResolutions, setCaseResolutions] = useState<Map<string, CaseResolution>>(new Map())
  const [caseChoices, setCaseChoices] = useState<Record<string, string>>({}) // reference -> caseId | '' (unlinked)
  const [result, setResult] = useState<BulkImportResult | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: fields } = useImportFields(entityType)
  const parseFile = useParseImportFile()
  const resolvePeople = useResolvePeople()
  const resolveCases = useResolveCases()
  const bulkImport = useBulkImport()

  const usesPersonRef = (fields ?? []).some((f) => isPersonRefField(f.key))
  const usesCaseRef = (fields ?? []).some((f) => isCaseRefField(f.key))

  const personTuples = useMemo<PersonTuple[]>(() => {
    if (!preview || !usesPersonRef) return []
    const seen = new Map<string, PersonTuple>()
    for (const row of preview.rows) {
      const firstName = cellValue(row, preview.headers, mapping.personFirstName ?? null)
      const lastName = cellValue(row, preview.headers, mapping.personLastName ?? null)
      const nationalId = cellValue(row, preview.headers, mapping.personNationalId ?? null)
      if (!firstName && !lastName) continue
      const key = personKey(firstName, lastName, nationalId)
      if (!seen.has(key)) seen.set(key, { key, firstName, lastName, nationalId })
    }
    return Array.from(seen.values())
  }, [preview, mapping, usesPersonRef])

  const caseReferences = useMemo<string[]>(() => {
    if (!preview || !usesCaseRef) return []
    const seen = new Set<string>()
    for (const row of preview.rows) {
      const reference = cellValue(row, preview.headers, mapping.caseReference ?? null)
      if (reference) seen.add(reference)
    }
    return Array.from(seen)
  }, [preview, mapping, usesCaseRef])

  const reset = () => {
    setStep('type')
    setEntityType('')
    setPreview(null)
    setMapping({})
    setPersonResolutions(new Map())
    setPersonChoices({})
    setCaseResolutions(new Map())
    setCaseChoices({})
    setResult(null)
  }

  // ---- Step: choose file ----

  const handlePickFile = async () => {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const path = await open({ multiple: false, filters: [{ name: m["import.spreadsheet"](), extensions: ['csv', 'xlsx', 'xls', 'xlsb', 'ods'] }] })
      if (typeof path !== 'string') return
      try {
        const parsed = await parseFile.mutateAsync({ path })
        setPreview(parsed)
        setStep('mapping')
      } catch {
        t.error(m["import.read_failed"](), { description: m["import.read_failed_desc"]() })
      }
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = await parseFile.mutateAsync({ file })
      setPreview(parsed)
      setStep('mapping')
    } catch {
      t.error(m["import.read_failed"](), { description: m["import.read_failed_desc"]() })
    }
  }

  // ---- Step: mapping -> resolving ----

  const handleMappingNext = async () => {
    if (!preview || !fields) return

    if (!usesPersonRef && !usesCaseRef) {
      setStep('preview')
      return
    }

    try {
      if (personTuples.length > 0) {
        const resolutions = await resolvePeople.mutateAsync(
          personTuples.map((p) => ({ key: p.key, firstName: p.firstName, lastName: p.lastName, nationalId: p.nationalId || null })),
        )
        const map = new Map(resolutions.map((r) => [r.key, r]))
        setPersonResolutions(map)
        const choices: Record<string, string> = {}
        for (const r of resolutions) choices[r.key] = r.exactMatch?.id ?? 'new'
        setPersonChoices(choices)
      }
      if (caseReferences.length > 0) {
        const resolutions = await resolveCases.mutateAsync(caseReferences)
        setCaseResolutions(new Map(resolutions.map((r) => [r.reference, r])))
        const choices: Record<string, string> = {}
        for (const r of resolutions) choices[r.reference] = r.matchedCaseId ?? ''
        setCaseChoices(choices)
      }
      setStep('resolving')
    } catch {
      t.error(m["import.resolve_failed"](), { description: m["common.try_again"]() })
    }
  }

  // ---- Final row building ----

  const rowsToImport = useMemo(() => {
    if (!preview || !entityType) return []
    return preview.rows.map((row) => {
      const built: Record<string, string> = {}
      for (const [fieldKey, headerName] of Object.entries(mapping)) {
        if (isPersonRefField(fieldKey) || isCaseRefField(fieldKey)) continue
        const value = cellValue(row, preview.headers, headerName)
        if (value) built[fieldKey] = value
      }
      if (usesPersonRef) {
        const firstName = cellValue(row, preview.headers, mapping.personFirstName ?? null)
        const lastName = cellValue(row, preview.headers, mapping.personLastName ?? null)
        const nationalId = cellValue(row, preview.headers, mapping.personNationalId ?? null)
        if (firstName || lastName) {
          const choice = personChoices[personKey(firstName, lastName, nationalId)]
          if (choice && choice !== 'new') built.personId = choice
        }
      }
      if (usesCaseRef) {
        const reference = cellValue(row, preview.headers, mapping.caseReference ?? null)
        if (reference) {
          const choice = caseChoices[reference]
          if (choice) built.caseId = choice
        }
      }
      return built
    })
  }, [preview, mapping, entityType, usesPersonRef, usesCaseRef, personChoices, caseChoices])

  const handleConfirmImport = async () => {
    if (!entityType) return
    try {
      const outcome = await bulkImport.mutateAsync({ entityType, rows: rowsToImport })
      setResult(outcome)
      setStep('result')
    } catch {
      t.error(m["import.failed"](), { description: m["common.try_again"]() })
    }
  }

  return (
    <Field>
      <FieldLabel>{m["import.title"]()}</FieldLabel>
      <FieldDescription>
        {m["import.desc"]()}
      </FieldDescription>

      <div className="flex flex-col gap-4 pt-1 md:max-w-2xl">
        {step === 'type' && (
          <div className="flex flex-col gap-3">
            <StepHeader title={m["import.step1_title"]()} description={m["import.step1_desc"]()} />
            <Select value={entityType} onValueChange={(value) => value && setEntityType(value as ImportableEntityType)}>
              <SelectTrigger className="w-full md:max-w-sm">
                <SelectValue placeholder={m["import.record_type"]()} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {importableEntityTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button type="button" size="sm" className="w-fit" disabled={!entityType} onClick={() => setStep('file')}>
              {m["common.next"]()}
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Button>
          </div>
        )}

        {step === 'file' && (
          <div className="flex flex-col gap-3">
            <StepHeader title={m["import.step2_title"]()} description={m["import.step2_desc"]()} />
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={handlePickFile} disabled={parseFile.isPending}>
                <HugeiconsIcon icon={FileImportIcon} />
                {m["import.choose_file"]()}
              </Button>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.xlsb,.ods" className="hidden" onChange={handleFileInputChange} />
            </div>
            <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => setStep('type')}>
              <HugeiconsIcon icon={ArrowLeft01Icon} />
              {m["common.back"]()}
            </Button>
          </div>
        )}

        {step === 'mapping' && preview && fields && (
          <div className="flex flex-col gap-3">
            <StepHeader
              title={m["import.step3_title"]()}
              description={preview.rows.length === 1 ? m["import.step3_desc_one"]() : m["import.step3_desc"]({ count: preview.rows.length })}
            />
            <div className="flex flex-col gap-2 rounded-md border border-input/40 p-2">
              {fields.map((f) => (
                <div key={f.key} className="grid grid-cols-2 items-center gap-2 text-xs">
                  <span>
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </span>
                  <Select
                    value={mapping[f.key] ?? '__ignore__'}
                    onValueChange={(value) => setMapping((prev) => ({ ...prev, [f.key]: value === '__ignore__' ? null : value }))}
                  >
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue placeholder={m["import.ignore"]()} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="__ignore__">{m["import.ignore"]()}</SelectItem>
                        {preview.headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setStep('file')}>
                <HugeiconsIcon icon={ArrowLeft01Icon} />
                {m["common.back"]()}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (Object.keys(mapping).length === 0 && fields.length > 0) setMapping(guessMapping(fields, preview.headers))
                  handleMappingNext()
                }}
                disabled={resolvePeople.isPending || resolveCases.isPending}
              >
                {m["common.next"]()}
                <HugeiconsIcon icon={ArrowRight01Icon} />
              </Button>
              {Object.keys(mapping).length === 0 && (
                <Button type="button" size="sm" variant="secondary" onClick={() => setMapping(guessMapping(fields, preview.headers))}>
                  {m["import.guess"]()}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'resolving' && (
          <div className="flex flex-col gap-3">
            <StepHeader
              title={m["import.step4_title"]()}
              description={m["import.step4_desc"]()}
            />

            {personTuples.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-medium text-muted-foreground">{m["import.people_count"]({ count: personTuples.length })}</h4>
                {personTuples.map((tuple) => {
                  const resolution = personResolutions.get(tuple.key)
                  const choice = personChoices[tuple.key] ?? 'new'
                  return (
                    <div key={tuple.key} className="flex flex-wrap items-center gap-2 rounded-md border border-input/40 p-2 text-xs">
                      <span className="min-w-40 font-medium">
                        {tuple.firstName} {tuple.lastName}
                        {tuple.nationalId && <span className="text-muted-foreground"> · {tuple.nationalId}</span>}
                      </span>
                      <Select value={choice} onValueChange={(value) => value && setPersonChoices((prev) => ({ ...prev, [tuple.key]: value }))}>
                        <SelectTrigger size="sm" className="min-w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="new">{m["import.create_person"]()}</SelectItem>
                            {resolution?.exactMatch && (
                              <SelectItem value={resolution.exactMatch.id}>{m["import.use_existing"]({ name: personFullName(resolution.exactMatch) })}</SelectItem>
                            )}
                            {resolution?.candidates.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {m["import.use_existing"]({ name: personFullName(c) })}
                                {c.nationalId ? ` · ${c.nationalId}` : ''}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {choice === 'new' && (
                        <span className="text-muted-foreground">
                          {resolution?.exactMatch || (resolution?.candidates.length ?? 0) > 0
                            ? m["import.new_despite"]()
                            : m["import.no_match_new"]()}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {caseReferences.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-medium text-muted-foreground">{m["import.case_refs_count"]({ count: caseReferences.length })}</h4>
                {caseReferences.map((reference) => {
                  const resolution = caseResolutions.get(reference)
                  const linked = caseChoices[reference] || null
                  return (
                    <div key={reference} className="flex flex-wrap items-center gap-2 rounded-md border border-input/40 p-2 text-xs">
                      <span className="min-w-40 font-medium">{reference}</span>
                      {resolution?.matchedCaseId ? (
                        <span className="text-muted-foreground">{m["import.matched_case"]()}</span>
                      ) : (
                        <>
                          <span className="text-muted-foreground">{m["import.no_exact"]()}</span>
                          <div className="w-64">
                            <CasePicker value={linked} onValueChange={(id) => setCaseChoices((prev) => ({ ...prev, [reference]: id ?? '' }))} />
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setStep('mapping')}>
                <HugeiconsIcon icon={ArrowLeft01Icon} />
                {m["common.back"]()}
              </Button>
              <Button type="button" size="sm" onClick={() => setStep('preview')}>
                {m["common.next"]()}
                <HugeiconsIcon icon={ArrowRight01Icon} />
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="flex flex-col gap-3">
            <StepHeader
              title={m["import.step5_title"]()}
              description={rowsToImport.length === 1 ? m["import.step5_desc_one"]() : m["import.step5_desc"]({ count: rowsToImport.length })}
            />
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setStep(usesPersonRef || usesCaseRef ? 'resolving' : 'mapping')}>
                <HugeiconsIcon icon={ArrowLeft01Icon} />
                {m["common.back"]()}
              </Button>
              <Button type="button" size="sm" onClick={handleConfirmImport} disabled={bulkImport.isPending || rowsToImport.length === 0}>
                {rowsToImport.length === 1 ? m["import.import_one"]() : m["import.import_n"]({ count: rowsToImport.length })}
              </Button>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="flex flex-col gap-3">
            <StepHeader
              title={m["import.done"]()}
              description={result.failed.length > 0 ? m["import.imported_failed"]({ count: result.imported, failed: result.failed.length }) : m["import.imported"]({ count: result.imported })}
            />
            {result.failed.length > 0 && (
              <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-2">
                {result.failed.map((failure) => (
                  <div key={failure.row} className="text-xs">
                    <span className="font-medium">{m["import.row"]({ number: failure.row + 1 })}</span> <span className="text-muted-foreground">{failure.error}</span>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" size="sm" variant="secondary" className="w-fit" onClick={reset}>
              {m["import.another"]()}
            </Button>
          </div>
        )}
      </div>
    </Field>
  )
}
