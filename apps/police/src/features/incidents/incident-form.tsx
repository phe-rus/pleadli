import * as m from '@/paraglide/messages'
import { PersonPicker } from '@/components/person-picker'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { createIncidentSchema, type Incident } from './schema'
import { useCreateIncident, useUpdateIncident } from './queries'

export type IncidentFormProps = {
  incident?: Incident
  onSuccess?: (incident: Incident) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function IncidentForm({ incident, onSuccess, onDirtyChange }: IncidentFormProps) {
  const createIncident = useCreateIncident()
  const updateIncident = useUpdateIncident()

  const form = useAppForm({
    defaultValues: {
      summary: incident?.summary ?? '',
      description: incident?.description ?? '',
      location: incident?.location ?? '',
      occurredAt: incident ? toDatetimeLocal(incident.occurredAt) : toDatetimeLocal(Date.now()),
      personId: incident?.personId ?? (null as string | null),
      stationDiaryEntryId: incident?.stationDiaryEntryId ?? (null as string | null),
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createIncidentSchema.safeParse({
          ...value,
          occurredAt: new Date(value.occurredAt).getTime(),
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, occurredAt: new Date(value.occurredAt).getTime() }
        const result = incident
          ? await updateIncident.mutateAsync({ id: incident.id, input })
          : await createIncident.mutateAsync(input)
        t.success(incident ? m["incidents.updated"]() : m["incidents.recorded"]())
        if (!incident) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(incident ? m["incidents.update_failed"]() : m["incidents.record_failed"](), {
          description: m["common.try_again"](),
        })
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
      <FieldGroup>
        <form.AppField name="summary">
          {(f) => <f.input label={m["common.summary"]()} placeholder={m["incidents.summary_placeholder"]()} />}
        </form.AppField>

        <form.AppField name="description">
          {(f) => (
            <Field data-invalid={f.state.meta.isTouched && !f.state.meta.isValid}>
              <FieldLabel>{m["common.description"]()}</FieldLabel>
              <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder={m["common.details_placeholder"]()} />
            </Field>
          )}
        </form.AppField>

        <form.AppField name="location">
          {(f) => <f.input label={m["common.location"]()} placeholder={m["incidents.location_placeholder"]()} />}
        </form.AppField>

        <form.AppField name="occurredAt">
          {(f) => (
            <Field>
              <FieldLabel>{m["incidents.occurred_at"]()}</FieldLabel>
              <Input
                type="datetime-local"
                value={f.state.value}
                onChange={(event) => f.handleChange(event.target.value)}
              />
            </Field>
          )}
        </form.AppField>

        <form.AppField name="personId">
          {(f) => (
            <Field>
              <FieldLabel>{m["common.related_person"]()}</FieldLabel>
              <PersonPicker value={f.state.value} onValueChange={f.handleChange} />
            </Field>
          )}
        </form.AppField>

        <AttachmentsField entityType={entityTypes.incident} entityId={incident?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={incident ? m["common.save_changes"]() : m["incidents.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
