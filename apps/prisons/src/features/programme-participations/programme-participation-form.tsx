import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useCreateProgrammeParticipation } from './queries'
import { createProgrammeParticipationSchema, programmeCategories, programmeStatuses, type ProgrammeParticipation } from './schema'

export type ProgrammeParticipationFormProps = {
  prisonerId: string
  onSuccess?: (participation: ProgrammeParticipation) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Records participation in a real, named rehabilitation/work programme
 * (docs/prisons/RESEARCH.md §10, UPS's own site) — vocational training,
 * prison industries, or prison farming. No attendance calendar exists for
 * these, only participation status.
 */
export function ProgrammeParticipationForm({ prisonerId, onSuccess, onDirtyChange }: ProgrammeParticipationFormProps) {
  const createParticipation = useCreateProgrammeParticipation()

  const form = useAppForm({
    defaultValues: {
      category: '',
      programmeName: '',
      status: 'active',
      startedAt: toDatetimeLocal(Date.now()),
      notes: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createProgrammeParticipationSchema.safeParse({
          ...value,
          prisonerId,
          startedAt: new Date(value.startedAt).getTime(),
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, prisonerId, startedAt: new Date(value.startedAt).getTime() }
        const result = await createParticipation.mutateAsync(input)
        t.success('Programme participation recorded')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not record participation', { description: 'Please try again.' })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="category">
        {(f) => (
          <Field>
            <FieldLabel>Category</FieldLabel>
            <Select items={programmeCategories} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {programmeCategories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="programmeName">{(f) => <f.input label="Programme name" placeholder="e.g. Tailoring workshop" />}</form.AppField>
        <form.AppField name="status">
          {(f) => (
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select items={programmeStatuses} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {programmeStatuses.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.AppField>
      </div>

      <form.AppField name="startedAt">
        {(f) => (
          <Field>
            <FieldLabel>Started at</FieldLabel>
            <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
          </Field>
        )}
      </form.AppField>

      <form.AppField name="notes">
        {(f) => (
          <Field>
            <FieldLabel>Notes (optional)</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="Notes…" />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Record participation" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
