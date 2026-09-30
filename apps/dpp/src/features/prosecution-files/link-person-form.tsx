import { PersonPicker } from '@/components/person-picker'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useLinkPersonToFile } from './queries'
import { filePersonRoles, type ProsecutionFilePerson } from './schema'
import * as m from '@/paraglide/messages'

export type LinkPersonFormProps = {
  prosecutionFileId: string
  onSuccess?: (link: ProsecutionFilePerson) => void
}

export function LinkPersonForm({ prosecutionFileId, onSuccess }: LinkPersonFormProps) {
  const linkPerson = useLinkPersonToFile()

  const form = useAppForm({
    defaultValues: {
      personId: '',
      role: 'accused' as string,
    },
    onSubmit: async ({ value, formApi }) => {
      if (!value.personId) return
      try {
        const result = await linkPerson.mutateAsync({ prosecutionFileId, personId: value.personId, role: value.role })
        t.success(m["file.link.linked"]())
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(m["file.link.link_failed"](), { description: m["common.try_again"]() })
      }
    },
  })

  return (
    <form
      className="flex flex-1 flex-col gap-4 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="personId">
        {(f) => (
          <Field>
            <FieldLabel>{m["file.link.person"]()}</FieldLabel>
            <PersonPicker value={f.state.value || null} onValueChange={(id) => f.handleChange(id ?? '')} />
          </Field>
        )}
      </form.AppField>

      <form.AppField name="role">
        {(f) => (
          <Field>
            <FieldLabel>{m["file.link.role"]()}</FieldLabel>
            <Select items={filePersonRoles} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={m["file.link.role_placeholder"]()} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {filePersonRoles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m["file.link.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
