import { AttachmentsField, entityTypes } from '@/features/attachments'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreatePerson, useUpdatePerson } from './queries'
import { createPersonSchema, type Person } from './schema'

export type PersonFormProps = {
  person?: Person
  onSuccess?: (person: Person) => void
  onDirtyChange?: (dirty: boolean) => void
}

export function PersonForm({ person, onSuccess, onDirtyChange }: PersonFormProps) {
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
      onSubmit: ({ value }) => {
        const parsed = createPersonSchema.safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = person
          ? await updatePerson.mutateAsync({ id: person.id, input: value })
          : await createPerson.mutateAsync(value)
        t.success(person ? 'Person updated' : 'Person added')
        if (!person) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(person ? 'Could not update person' : 'Could not add person', { description: 'Please try again.' })
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
        <form.AppField name="firstName">{(f) => <f.input label="First name" />}</form.AppField>
        <form.AppField name="lastName">{(f) => <f.input label="Last name" />}</form.AppField>
      </div>

      <form.AppField name="otherNames">{(f) => <f.input label="Other names (optional)" />}</form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="phone">{(f) => <f.input label="Phone (optional)" />}</form.AppField>
        <form.AppField name="nationalId">{(f) => <f.input label="National ID (optional)" />}</form.AppField>
      </div>

      <form.AppField name="address">{(f) => <f.input label="Address (optional)" />}</form.AppField>

      <AttachmentsField entityType={entityTypes.person} entityId={person?.id} />

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={person ? 'Save changes' : 'Add person'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
