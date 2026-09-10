import { PersonPicker } from '@/components/person-picker'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Switch } from '@pleadli/ui/switch'
import { Textarea } from '@pleadli/ui/textarea'
import { useCreateEstablishmentMember, useUpdateEstablishmentMember } from './queries'
import { stationEstablishmentPostSuggestions, type StationEstablishmentMember } from './schema'

export type EstablishmentMemberFormProps = {
  member?: StationEstablishmentMember
  onSuccess?: (member: StationEstablishmentMember) => void
}

export function EstablishmentMemberForm({ member, onSuccess }: EstablishmentMemberFormProps) {
  const createMember = useCreateEstablishmentMember()
  const updateMember = useUpdateEstablishmentMember()

  const form = useAppForm({
    defaultValues: {
      personId: member?.personId ?? '',
      post: member?.post ?? '',
      rank: member?.rank ?? '',
      active: member?.active ?? true,
      notes: member?.notes ?? '',
    },
    onSubmit: async ({ value }) => {
      try {
        const result = member
          ? await updateMember.mutateAsync({ id: member.id, input: value })
          : await createMember.mutateAsync(value)
        t.success(member ? 'Establishment entry updated' : 'Added to station establishment')
        onSuccess?.(result)
      } catch {
        t.error(member ? 'Could not update entry' : 'Could not add to establishment', {
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
      <form.AppField name="personId">
        {(f) => (
          <Field>
            <FieldLabel>Officer / person</FieldLabel>
            <PersonPicker value={f.state.value || null} onValueChange={(id) => f.handleChange(id ?? '')} />
          </Field>
        )}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="post">
          {(f) => (
            <f.input
              label="Standing post"
              placeholder={`e.g. ${stationEstablishmentPostSuggestions.slice(0, 3).join(', ')}…`}
            />
          )}
        </form.AppField>
        <form.AppField name="rank">{(f) => <f.input label="Rank" />}</form.AppField>
      </div>

      <form.AppField name="active">
        {(f) => (
          <Field orientation="horizontal">
            <Switch checked={f.state.value} onCheckedChange={f.handleChange} />
            <FieldLabel>Currently posted here</FieldLabel>
          </Field>
        )}
      </form.AppField>

      <form.AppField name="notes">
        {(f) => (
          <Field>
            <FieldLabel>Notes (optional)</FieldLabel>
            <Textarea value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} rows={3} />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={member ? 'Save changes' : 'Add to establishment'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
