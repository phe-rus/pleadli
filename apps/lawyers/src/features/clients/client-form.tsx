import { FormSection } from '@/components/form-section'
import { messageOf } from '@/lib/api'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateClient, useUpdateClient } from './queries'
import { useUsagesEnabled } from '@/features/installation'
import * as m from '@/paraglide/messages'
import { clientFormSchema, clientKinds, custodyOptions, type Client, type ClientKind, type ClientSummary } from './schema'

/** A client: a person or an organisation. For criminal work, where an accused
 * client is held matters as much as to the court: it is who to visit, and
 * where to ask for them to be produced. It is asked only when the practice
 * does criminal work, and only of a person. */
export function ClientForm({ existing, onSuccess, onDirtyChange }: { existing?: Client | ClientSummary; onSuccess?: (client: Client) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const create = useCreateClient()
  const update = useUpdateClient()
  const { data: usages } = useUsagesEnabled()
  const criminal = usages?.includes('criminal') ?? false
  const form = useAppForm({
    defaultValues: {
      name: existing?.name ?? '',
      kind: (existing?.kind ?? 'person') as ClientKind,
      phone: existing?.phone ?? '',
      email: existing?.email ?? '',
      address: existing?.address ?? '',
      custody: existing?.custody ?? '',
      custodyPlace: existing?.custodyPlace ?? '',
      notes: existing?.notes ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = clientFormSchema().safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      const held = value.custody === 'remanded' || value.custody === 'serving'
      const person = value.kind === 'person'
      const input = {
        name: value.name,
        kind: value.kind,
        phone: value.phone.trim() || null,
        email: value.email.trim() || null,
        address: value.address.trim() || null,
        custody: person ? value.custody || null : null,
        custodyPlace: person && held ? value.custodyPlace.trim() || null : null,
        notes: value.notes.trim() || null,
      }
      try {
        const client = existing ? await update.mutateAsync({ id: existing.id, input }) : await create.mutateAsync(input)
        t.success(existing ? m["client.form.updated"]() : m["client.form.added"]())
        if (!existing) formApi.reset()
        onSuccess?.(client)
      } catch (error) {
        t.error(m["client.form.save_failed"](), { description: messageOf(error) })
      }
    },
  })
  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="flex flex-1 flex-col gap-5 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FormSection title={m["client.form.section.who"]()}>
        <form.AppField name="kind">
          {(f) => <f.select label={m["client.form.kind"]()} options={clientKinds.map((k) => ({ value: k, label: k === 'person' ? m["client.kind.person"]() : m["client.kind.organisation"]() }))} />}
        </form.AppField>
        <form.AppField name="name">{(f) => <f.input label={m["client.form.name"]()} />}</form.AppField>
        <form.Subscribe selector={(state) => [state.values.kind, state.values.custody] as const}>
          {([kind, custody]) =>
            criminal &&
            kind === 'person' && (
              <>
                <form.AppField name="custody">{(f) => <f.select label={m["client.form.custody"]()} options={custodyOptions.map((c) => ({ value: c.id, label: c.label }))} placeholder={m["matter.form.not_recorded"]()} />}</form.AppField>
                {(custody === 'remanded' || custody === 'serving') && <form.AppField name="custodyPlace">{(f) => <f.input label={m["client.form.held_at"]()} placeholder={m["client.form.held_at_placeholder"]()} />}</form.AppField>}
              </>
            )
          }
        </form.Subscribe>
      </FormSection>
      <FormSection title={m["client.form.section.contact"]()}>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField name="phone">{(f) => <f.input label={m["client.form.phone"]()} type="tel" />}</form.AppField>
          <form.AppField name="email">{(f) => <f.input label={m["client.form.email"]()} type="email" />}</form.AppField>
        </div>
        <form.AppField name="address">{(f) => <f.input label={m["client.form.address"]()} />}</form.AppField>
      </FormSection>
      <FormSection title={m["matter.form.section.notes"]()}>
        <form.AppField name="notes">{(f) => <f.textarea label={m["client.form.notes"]()} rows={3} />}</form.AppField>
      </FormSection>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label={existing ? m["matter.form.save"]() : m["client.form.add"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
