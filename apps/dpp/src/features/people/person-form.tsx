import { AttachmentsField, entityTypes } from '@/features/attachments'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreatePerson, useUpdatePerson } from './queries'
import { createPersonSchema, type Person } from './schema'
import * as m from '@/paraglide/messages'

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
        t.success(person ? m["person.form.updated"]() : m["person.form.added"]())
        if (!person) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(person ? m["person.form.update_failed"]() : m["person.form.add_failed"](), { description: m["common.try_again"]() })
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
        <form.AppField name="firstName">{(f) => <f.input label={m["person.form.first_name"]()} />}</form.AppField>
        <form.AppField name="lastName">{(f) => <f.input label={m["person.form.last_name"]()} />}</form.AppField>
      </div>

      <form.AppField name="otherNames">{(f) => <f.input label={m["person.form.other_names_optional"]()} />}</form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="phone">{(f) => <f.input label={m["person.form.phone_optional"]()} />}</form.AppField>
        <form.AppField name="nationalId">{(f) => <f.input label={m["person.form.national_id_optional"]()} />}</form.AppField>
      </div>

      <form.AppField name="address">{(f) => <f.input label={m["person.form.address_optional"]()} />}</form.AppField>

      <AttachmentsField entityType={entityTypes.person} entityId={person?.id} />

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={person ? m["common.save_changes"]() : m["person.form.add"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
