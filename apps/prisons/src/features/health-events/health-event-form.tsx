import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useCreateHealthEvent } from './queries'
import { createHealthEventSchema, healthEventTypes, type HealthEvent } from './schema'

export type HealthEventFormProps = {
  prisonerId: string
  onSuccess?: (event: HealthEvent) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Records a health event (docs/prisons/PRODUCT.md §Health & Welfare) —
 * tracking only, never a clinical record. Does not change custody status:
 * ss.75-76 keep a hospitalised prisoner "under detention" throughout.
 */
export function HealthEventForm({ prisonerId, onSuccess, onDirtyChange }: HealthEventFormProps) {
  const createEvent = useCreateHealthEvent()

  const form = useAppForm({
    defaultValues: {
      eventType: '',
      facilityName: '',
      occurredAt: toDatetimeLocal(Date.now()),
      authorizedBy: '',
      notes: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createHealthEventSchema.safeParse({ ...value, prisonerId, occurredAt: new Date(value.occurredAt).getTime() })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, prisonerId, occurredAt: new Date(value.occurredAt).getTime() }
        const result = await createEvent.mutateAsync(input)
        t.success('Health event recorded')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not record health event', { description: 'Please try again.' })
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
      <form.AppField name="eventType">
        {(f) => (
          <Field>
            <FieldLabel>Event type</FieldLabel>
            <Select items={healthEventTypes} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select event type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {healthEventTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>Recording this never changes custody status — the prisoner stays legally under detention throughout.</FieldDescription>
          </Field>
        )}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="facilityName">{(f) => <f.input label="Facility (optional)" placeholder="e.g. Murchison Bay Hospital" />}</form.AppField>
        <form.AppField name="occurredAt">
          {(f) => (
            <Field>
              <FieldLabel>Occurred at</FieldLabel>
              <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
      </div>

      <form.AppField name="authorizedBy">{(f) => <f.input label="Authorized by (optional)" placeholder="Medical officer / officer in charge" />}</form.AppField>

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
          <form.submit label="Record event" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
