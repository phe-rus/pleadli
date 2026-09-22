import { DateField } from '@/components/date-field'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useAddParty, useUpdateParty } from './queries'
import { custodyOptions, partyFormSchema, roles, type Party } from './schema'

export type PartyFormProps = {
  caseId: string
  existing?: Party
  onSuccess?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

/** A person in a case. For an accused person, where they are held matters most
 * to the court, so custody, the place and the date a remand runs to are here. */
export function PartyForm({ caseId, existing, onSuccess, onDirtyChange }: PartyFormProps) {
  const add = useAddParty()
  const update = useUpdateParty()

  const form = useAppForm({
    defaultValues: {
      role: existing?.role ?? 'accused',
      name: existing?.name ?? '',
      custody: existing?.custody ?? '',
      remandUntil: existing?.remandUntil ? toIsoDay(existing.remandUntil) : '',
      custodyPlace: existing?.custodyPlace ?? '',
      note: existing?.note ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = partyFormSchema.safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      const accused = value.role === 'accused'
      const remanded = accused && value.custody === 'remanded'
      const input = {
        role: value.role,
        name: value.name,
        custody: accused && value.custody ? value.custody : null,
        remandUntil: remanded ? fromDateInput(value.remandUntil) : null,
        custodyPlace: remanded ? value.custodyPlace.trim() || null : null,
        note: value.note.trim() || null,
      }
      try {
        if (existing) await update.mutateAsync({ id: existing.id, input })
        else await add.mutateAsync({ caseId, input })
        t.success(existing ? 'Person updated' : 'Person added')
        if (!existing) formApi.reset()
        onSuccess?.()
      } catch (error) {
        t.error('Could not save the person', { description: messageOf(error) })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="role">{(f) => <f.select label="Role" options={roles.map((r) => ({ value: r.id, label: r.label }))} />}</form.AppField>
      <form.AppField name="name">{(f) => <f.input label="Name" />}</form.AppField>

      <form.Subscribe selector={(state) => [state.values.role, state.values.custody] as const}>
        {([role, custody]) =>
          role === 'accused' && (
            <>
              <form.AppField name="custody">
                {(f) => <f.select label="Custody" options={custodyOptions.map((c) => ({ value: c.id, label: c.label }))} placeholder="Not recorded" />}
              </form.AppField>
              {custody === 'remanded' && (
                <>
                  <form.AppField name="custodyPlace">{(f) => <f.input label="Held at" placeholder="The prison or remand home" />}</form.AppField>
                  <form.AppField name="remandUntil">
                    {(f) => <DateField label="Remanded until" value={f.state.value} onChange={f.handleChange} description="The date the remand runs to. Leave empty if it has not been recorded." />}
                  </form.AppField>
                </>
              )}
            </>
          )
        }
      </form.Subscribe>

      <form.AppField name="note">{(f) => <f.textarea label="Note (optional)" rows={2} />}</form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={existing ? 'Save changes' : 'Add person'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
