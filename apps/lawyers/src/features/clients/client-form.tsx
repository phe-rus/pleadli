import { messageOf } from '@/lib/api'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateClient, useUpdateClient } from './queries'
import { clientFormSchema, custodyOptions, type Client, type ClientSummary } from './schema'

/** A client. Where an accused client is held matters to the advocate as much as
 * to the court: it is who to visit, and where to ask for them to be produced. */
export function ClientForm({ existing, onSuccess, onDirtyChange }: { existing?: Client | ClientSummary; onSuccess?: (client: Client) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const create = useCreateClient()
  const update = useUpdateClient()
  const form = useAppForm({
    defaultValues: {
      name: existing?.name ?? '',
      phone: existing?.phone ?? '',
      address: existing?.address ?? '',
      custody: existing?.custody ?? '',
      custodyPlace: existing?.custodyPlace ?? '',
      notes: existing?.notes ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = clientFormSchema.safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      const held = value.custody === 'remanded' || value.custody === 'serving'
      const input = {
        name: value.name,
        phone: value.phone.trim() || null,
        address: value.address.trim() || null,
        custody: value.custody || null,
        custodyPlace: held ? value.custodyPlace.trim() || null : null,
        notes: value.notes.trim() || null,
      }
      try {
        const client = existing ? await update.mutateAsync({ id: existing.id, input }) : await create.mutateAsync(input)
        t.success(existing ? 'Client updated' : 'Client added')
        if (!existing) formApi.reset()
        onSuccess?.(client)
      } catch (error) {
        t.error('Could not save the client', { description: messageOf(error) })
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
      <form.AppField name="name">{(f) => <f.input label="Name" />}</form.AppField>
      <form.AppField name="phone">{(f) => <f.input label="Phone (optional)" />}</form.AppField>
      <form.AppField name="address">{(f) => <f.input label="Address (optional)" />}</form.AppField>
      <form.AppField name="custody">{(f) => <f.select label="Custody" options={custodyOptions.map((c) => ({ value: c.id, label: c.label }))} placeholder="Not recorded" />}</form.AppField>
      <form.Subscribe selector={(state) => state.values.custody}>
        {(custody) => (custody === 'remanded' || custody === 'serving') && <form.AppField name="custodyPlace">{(f) => <f.input label="Held at" placeholder="The prison or remand home" />}</form.AppField>}
      </form.Subscribe>
      <form.AppField name="notes">{(f) => <f.textarea label="Notes (optional)" rows={3} />}</form.AppField>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label={existing ? 'Save changes' : 'Add client'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
