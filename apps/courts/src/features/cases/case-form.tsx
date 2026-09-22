import { DateField } from '@/components/date-field'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateCase, useUpdateCase } from './queries'
import { caseFormSchema, courtLevels, type Case } from './schema'

export type CaseFormProps = {
  /** Given when editing; empty when registering a new case. */
  existing?: Case
  onSuccess?: (record: Case) => void
  onDirtyChange?: (dirty: boolean) => void
}

/** Registering a case here records what the court registry already holds: the
 * number it gave the case, and who and what it is about. The registry stays the
 * register of record. */
export function CaseForm({ existing, onSuccess, onDirtyChange }: CaseFormProps) {
  const create = useCreateCase()
  const update = useUpdateCase()

  const form = useAppForm({
    defaultValues: {
      courtNumber: existing?.courtNumber ?? '',
      title: existing?.title ?? '',
      courtLevel: existing?.courtLevel ?? 'magistrate',
      offence: existing?.offence ?? '',
      registeredOn: existing?.registeredOn ? toIsoDay(existing.registeredOn) : '',
      notes: existing?.notes ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = caseFormSchema.safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      const input = {
        courtNumber: value.courtNumber,
        title: value.title,
        courtLevel: value.courtLevel,
        offence: value.offence.trim() || null,
        registeredOn: fromDateInput(value.registeredOn),
        notes: value.notes.trim() || null,
      }
      try {
        const record = existing ? await update.mutateAsync({ id: existing.id, input }) : await create.mutateAsync(input)
        t.success(existing ? 'Case updated' : 'Case registered')
        if (!existing) formApi.reset()
        onSuccess?.(record)
      } catch (error) {
        t.error(existing ? 'Could not update the case' : 'Could not register the case', { description: messageOf(error) })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="courtNumber">{(f) => <f.input label="Court number" placeholder="CRB 214/2026" />}</form.AppField>
      <form.AppField name="title">{(f) => <f.input label="Title" placeholder="Uganda v. Okello John" />}</form.AppField>
      <form.AppField name="courtLevel">{(f) => <f.select label="Court" options={courtLevels.map((l) => ({ value: l.id, label: l.label }))} />}</form.AppField>
      <form.AppField name="offence">{(f) => <f.input label="Offence (optional)" />}</form.AppField>
      <form.AppField name="registeredOn">{(f) => <DateField label="Date registered (optional)" value={f.state.value} onChange={f.handleChange} />}</form.AppField>
      <form.AppField name="notes">{(f) => <f.textarea label="Notes (optional)" rows={3} />}</form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={existing ? 'Save changes' : 'Register case'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
