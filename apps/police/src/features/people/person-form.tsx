import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { FieldGroup } from '@pleadli/ui/field'
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
        t.success(person ? 'Person updated' : 'Person added', {
          description: `${value.lastName}, ${value.firstName}`,
        })
        if (!person) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(person ? 'Could not update person' : 'Could not add person', {
          description: 'Please try again.',
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
            {(f) => <f.input placeholder="First name" label="First name" />}
          </form.AppField>

          <form.AppField name="lastName">
            {(f) => <f.input placeholder="Last name" label="Last name" />}
          </form.AppField>

          <form.AppField name="otherNames">
            {(f) => <f.input placeholder="Other names" label="Other names" />}
          </form.AppField>

          <div className="col-span-2">
            <form.AppField name="phone">
              {(f) => <f.input placeholder="Phone number" label="Phone number" />}
            </form.AppField>
          </div>

          <div className="col-span-2">
            <form.AppField name="nationalId">
              {(f) => <f.input placeholder="NIN / National ID" label="NIN / National ID" />}
            </form.AppField>
          </div>

          <div className="col-span-2">
            <form.AppField name="address">
              {(f) => <f.textarea placeholder="Address" label="Address" />}
            </form.AppField>
          </div>
        </div>

        <DrawerFooter>
          <form.AppForm>
            <form.submit label={person ? 'Save changes' : 'Submit'} />
          </form.AppForm>
        </DrawerFooter>
      </FieldGroup>
    </form>
  )
}
