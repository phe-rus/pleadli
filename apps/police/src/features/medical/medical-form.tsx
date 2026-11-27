import * as m from '@/paraglide/messages'
import { PersonPicker } from '@/components/person-picker'
import { casesOptions, type Case } from '@/features/cases'
import { ApiError } from '@/lib/api'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useCreateMedicalExam, useUpdateMedicalExam } from './queries'
import { createMedicalExamSchema, medicalKinds, medicalStatuses, type MedicalExam } from './schema'

const NO_CASE = ''

function toLocal(ms: number | null) {
  if (ms == null) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function MedicalForm({ exam, caseId, onSuccess, onDirtyChange }: { exam?: MedicalExam; caseId?: string; onSuccess?: (exam: MedicalExam) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const create = useCreateMedicalExam()
  const update = useUpdateMedicalExam()
  const { data: cases } = useSuspenseQuery(casesOptions(''))
  // A restricted case this officer cannot open has no summary and cannot be picked here.
  const pickable = cases.filter((c: Case) => c.canView)

  const form = useAppForm({
    defaultValues: {
      kind: exam?.kind ?? 'pf3',
      personId: exam?.personId ?? '',
      caseId: exam?.caseId ?? caseId ?? NO_CASE,
      facility: exam?.facility ?? '',
      examinerName: exam?.examinerName ?? '',
      requestedAt: toLocal(exam?.requestedAt ?? Date.now()),
      examinedAt: toLocal(exam?.examinedAt ?? null),
      status: exam?.status ?? 'requested',
      findings: exam?.findings ?? '',
      notes: exam?.notes ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createMedicalExamSchema.safeParse(toInput(value))
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = toInput(value)
        const result = exam ? await update.mutateAsync({ id: exam.id, input }) : await create.mutateAsync(input)
        t.success(exam ? m["medical.updated"]() : m["medical.recorded"]())
        if (!exam) formApi.reset()
        onSuccess?.(result)
      } catch (error) {
        t.error(exam ? m["medical.update_failed"]() : m["medical.record_failed"](), { description: error instanceof ApiError && error.status === 422 ? error.message : m["common.try_again"]() })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form className="flex flex-1 flex-col gap-4 overflow-y-auto p-4" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit() }}>
      <FieldGroup>
        <form.AppField name="kind">{(f) => <f.select label={m["medical.kind_label"]()} options={[...medicalKinds]} />}</form.AppField>

        <form.AppField name="personId">
          {(f) => (
            <Field>
              <FieldLabel>{m["medical.person"]()}</FieldLabel>
              <PersonPicker value={f.state.value || null} onValueChange={(id) => f.handleChange(id ?? '')} />
            </Field>
          )}
        </form.AppField>

        <form.AppField name="caseId">
          {(f) => (
            <Field>
              <FieldLabel>{m["common.case"]()}</FieldLabel>
              <Select
                items={[{ value: NO_CASE, label: m["common.none"]() }, ...pickable.map((c: Case) => ({ value: c.id, label: `${c.reference}: ${c.summary}` }))]}
                value={f.state.value}
                onValueChange={(value) => f.handleChange(value ?? NO_CASE)}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder={m["common.select_case"]()} /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NO_CASE}>{m["common.none"]()}</SelectItem>
                    {pickable.map((c: Case) => (
                      <SelectItem key={c.id} value={c.id}>{c.reference}: {c.summary}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="facility">{(f) => <f.input label={m["medical.facility"]()} placeholder={m["medical.facility_placeholder"]()} />}</form.AppField>
          <form.AppField name="examinerName">{(f) => <f.input label={m["medical.examiner"]()} placeholder={m["medical.examiner_placeholder"]()} />}</form.AppField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="requestedAt">
            {(f) => (
              <Field>
                <FieldLabel>{m["medical.requested_at"]()}</FieldLabel>
                <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
              </Field>
            )}
          </form.AppField>
          <form.AppField name="examinedAt">
            {(f) => (
              <Field>
                <FieldLabel>{m["medical.examined_at"]()}</FieldLabel>
                <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
              </Field>
            )}
          </form.AppField>
        </div>

        <form.AppField name="status">{(f) => <f.select label={m["common.status"]()} options={[...medicalStatuses]} />}</form.AppField>
        <form.AppField name="findings">{(f) => <f.textarea label={m["medical.findings"]()} placeholder={m["medical.findings_placeholder"]()} />}</form.AppField>
        <form.AppField name="notes">{(f) => <f.textarea label={m["common.notes_optional"]()} placeholder={m["common.notes_optional"]()} />}</form.AppField>

        <DrawerFooter>
          <form.AppForm>
            <form.submit label={exam ? m["common.save_changes"]() : m["medical.record"]()} />
          </form.AppForm>
        </DrawerFooter>
      </FieldGroup>
    </form>
  )
}

function toInput(value: { kind: string; personId: string; caseId: string; facility: string; examinerName: string; requestedAt: string; examinedAt: string; status: string; findings: string; notes: string }) {
  return {
    ...value,
    caseId: value.caseId || null,
    requestedAt: new Date(value.requestedAt).getTime(),
    examinedAt: value.examinedAt ? new Date(value.examinedAt).getTime() : null,
  }
}
