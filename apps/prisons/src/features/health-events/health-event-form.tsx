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
import { m } from '@/paraglide/messages'

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
        t.success(m.health_events_health_event_recorded())
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(m.health_events_could_not_record_health_event(), { description: m.health_events_please_try_again() })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="panel-body"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="eventType">
        {(f) => (
          <Field>
            <FieldLabel>{m.health_events_event_type()}</FieldLabel>
            <Select items={healthEventTypes} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={m.health_events_select_event_type()} />
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
            <FieldDescription>{m.health_events_recording_this_never_changes_custody_sta()}</FieldDescription>
          </Field>
        )}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="facilityName">{(f) => <f.input label={m.health_events_facility_optional()} placeholder={m.health_events_e_g_murchison_bay_hospital()} />}</form.AppField>
        <form.AppField name="occurredAt">
          {(f) => (
            <Field>
              <FieldLabel>{m.health_events_occurred_at()}</FieldLabel>
              <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
      </div>

      <form.AppField name="authorizedBy">{(f) => <f.input label={m.health_events_authorized_by_optional()} placeholder={m.health_events_medical_officer_officer_in_charge()} />}</form.AppField>

      <form.AppField name="notes">
        {(f) => (
          <Field>
            <FieldLabel>{m.health_events_notes_optional()}</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder={m.health_events_notes()} />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m.health_events_record_event()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
