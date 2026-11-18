import * as m from '@/paraglide/messages'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { Switch } from '@pleadli/ui/switch'
import { t } from '@pleadli/ui/goey-toaster'
import { createPersonSchema } from './schema'
import { useCreatePerson, useUpdatePerson } from './queries'
import type { Person } from './schema'

export type PersonFormProps = {
  /** When provided, the form edits this person instead of creating a new one. */
  person?: Person
  onSuccess?: (person: Person) => void
}

export function PersonForm({ person, onSuccess }: PersonFormProps) {
  const createPerson = useCreatePerson()
  const updatePerson = useUpdatePerson()

  const form = useAppForm({
    defaultValues: {
      firstName: person?.firstName ?? '',
      lastName: person?.lastName ?? '',
      otherNames: person?.otherNames ?? '',
      phone: person?.phone ?? '',
      nationalId: person?.nationalId ?? '',
      address: person?.address ?? '',
      dateOfBirth: person?.dateOfBirth ?? '',
      dateOfBirthEstimated: person?.dateOfBirthEstimated ?? false,
    },
    validators: {
      onChange: createPersonSchema,
      onSubmit: createPersonSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = person
          ? await updatePerson.mutateAsync({ id: person.id, input: value })
          : await createPerson.mutateAsync(value)
        t.success(person ? m["people.updated"]() : m["people.added"](), {
          description: `${value.lastName}, ${value.firstName}`,
        })
        if (!person) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(person ? m["people.update_failed"]() : m["people.add_failed"](), {
          description: m["common.try_again"](),
        })
      }
    },
  })

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="firstName">
            {(f) => <f.input placeholder={m["people.first_name"]()} label={m["people.first_name"]()} />}
          </form.AppField>

          <form.AppField name="lastName">
            {(f) => <f.input placeholder={m["people.last_name"]()} label={m["people.last_name"]()} />}
          </form.AppField>

          <form.AppField name="otherNames">
            {(f) => <f.input placeholder={m["people.other_names"]()} label={m["people.other_names"]()} />}
          </form.AppField>

          <div className="col-span-2">
            <form.AppField name="phone">
              {(f) => <f.input placeholder={m["people.phone"]()} label={m["people.phone"]()} />}
            </form.AppField>
          </div>

          <div className="col-span-2">
            <form.AppField name="nationalId">
              {(f) => <f.input placeholder={m["people.nin"]()} label={m["people.nin"]()} />}
            </form.AppField>
          </div>

          <form.AppField name="dateOfBirth">
            {(f) => (
              <Field>
                <FieldLabel>{m["people.date_of_birth"]()}</FieldLabel>
                <Input type="date" max={new Date().toISOString().slice(0, 10)} value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
              </Field>
            )}
          </form.AppField>

          <form.AppField name="dateOfBirthEstimated">
            {(f) => (
              <Field>
                <FieldLabel>{m["people.dob_estimated"]()}</FieldLabel>
                <Switch checked={f.state.value} onCheckedChange={f.handleChange} />
              </Field>
            )}
          </form.AppField>

          <div className="col-span-2">
            <form.AppField name="address">
              {(f) => <f.textarea placeholder={m["people.address"]()} label={m["people.address"]()} />}
            </form.AppField>
          </div>
        </div>

        <AttachmentsField entityType={entityTypes.person} entityId={person?.id} />

        <DrawerFooter>
          <form.AppForm>
            <form.submit label={person ? m["common.save_changes"]() : m["common.submit"]()} />
          </form.AppForm>
        </DrawerFooter>
      </FieldGroup>
    </form>
  )
}
