import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useCreateVisit } from './queries'
import { createVisitSchema, visitStatuses, visitTypes, type Visit } from './schema'

export type VisitFormProps = {
  prisonerId: string
  onSuccess?: (visit: Visit) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Records a visit against the real, grounded procedure (docs/prisons/
 * RESEARCH.md §9): gate identification/search, reception registration,
 * supervised visit.
 */
export function VisitForm({ prisonerId, onSuccess, onDirtyChange }: VisitFormProps) {
  const createVisit = useCreateVisit()

  const form = useAppForm({
    defaultValues: {
      visitorName: '',
      visitorIdentification: '',
      visitedAt: toDatetimeLocal(Date.now()),
      supervisingOfficer: '',
      notes: '',
      visitType: 'ordinary',
      status: 'authorized',
      authorizedBy: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createVisitSchema.safeParse({ ...value, prisonerId, visitedAt: new Date(value.visitedAt).getTime() })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, prisonerId, visitedAt: new Date(value.visitedAt).getTime() }
        const result = await createVisit.mutateAsync(input)
        t.success('Visit recorded')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not record visit', { description: 'Please try again.' })
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
      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="visitType">
          {(f) => (
            <Field>
              <FieldLabel>Visit type</FieldLabel>
              <Select items={visitTypes} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select visit type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {visitTypes.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.AppField>
        <form.AppField name="status">
          {(f) => (
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select items={visitStatuses} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {visitStatuses.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.AppField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="visitorName">{(f) => <f.input label="Visitor name" />}</form.AppField>
        <form.AppField name="visitorIdentification">{(f) => <f.input label="Visitor ID (optional)" />}</form.AppField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="supervisingOfficer">{(f) => <f.input label="Supervising officer (optional)" />}</form.AppField>
        <form.AppField name="authorizedBy">{(f) => <f.input label="Authorized by (optional)" placeholder="e.g. Officer in charge" />}</form.AppField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="visitedAt">
          {(f) => (
            <Field>
              <FieldLabel>Visited at</FieldLabel>
              <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
      </div>

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
          <form.submit label="Record visit" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
