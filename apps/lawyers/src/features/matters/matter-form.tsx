import { DateField } from '@/components/date-field'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useClientChoices } from '../clients/queries'
import { useCloseMatter, useCreateMatter, useUpdateMatter } from './queries'
import { engagements, levels, matterFormSchema, type Matter } from './schema'

/** Opening a matter. How you came to act matters here: an appointment at the
 * expense of the state brings dated duties, which the application then tracks
 * as tasks. The reference is your own; the court number is the court's. */
export function MatterForm({ existing, defaultClientId, onSuccess, onDirtyChange }: { existing?: Matter; defaultClientId?: string; onSuccess?: (matter: Matter) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const create = useCreateMatter()
  const update = useUpdateMatter()
  const { data: clients } = useClientChoices()

  const form = useAppForm({
    defaultValues: {
      clientId: existing?.clientId ?? defaultClientId ?? '',
      title: existing?.title ?? '',
      ourRef: existing?.ourRef ?? '',
      courtNumber: existing?.courtNumber ?? '',
      courtName: existing?.courtName ?? '',
      courtLevel: existing?.courtLevel ?? '',
      offence: existing?.offence ?? '',
      engagement: existing?.engagement ?? 'private',
      appointedOn: existing?.appointedOn ? toIsoDay(existing.appointedOn) : '',
      notes: existing?.notes ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = matterFormSchema.safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      const input = {
        clientId: value.clientId,
        title: value.title,
        ourRef: value.ourRef.trim() || null,
        courtNumber: value.courtNumber.trim() || null,
        courtName: value.courtName.trim() || null,
        courtLevel: value.courtLevel || null,
        offence: value.offence.trim() || null,
        engagement: value.engagement,
        appointedOn: value.engagement === 'state_appointed' ? fromDateInput(value.appointedOn) : null,
        notes: value.notes.trim() || null,
      }
      try {
        const matter = existing ? await update.mutateAsync({ id: existing.id, input }) : await create.mutateAsync(input)
        t.success(existing ? 'Matter updated' : 'Matter opened')
        if (!existing) formApi.reset()
        onSuccess?.(matter)
      } catch (error) {
        t.error('Could not save the matter', { description: messageOf(error) })
      }
    },
  })
  useReportDirty(form, onDirtyChange)

  const choices = (clients ?? []).map((c) => ({ value: c.id, label: c.name }))

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {choices.length === 0 && <p className="text-muted-foreground">There are no clients yet. Add the client first, then open the matter.</p>}
      <form.AppField name="clientId">{(f) => <f.select label="Client" options={choices} placeholder="Choose the client" />}</form.AppField>
      <form.AppField name="title">{(f) => <f.input label="Title" placeholder="Uganda v. Okello John" />}</form.AppField>
      <form.AppField name="engagement">{(f) => <f.select label="How you came to act" options={engagements.map((e) => ({ value: e.id, label: e.label }))} />}</form.AppField>
      <form.Subscribe selector={(state) => state.values.engagement}>
        {(engagement) =>
          engagement === 'state_appointed' && (
            <form.AppField name="appointedOn">
              {(f) => <DateField label="Date of appointment" value={f.state.value} onChange={f.handleChange} description="The state-funded scheme's duties are dated from it: meeting the accused and confirming it to the court, and the certificate of trial readiness." />}
            </form.AppField>
          )
        }
      </form.Subscribe>
      <form.AppField name="ourRef">{(f) => <f.input label="Your reference (optional)" placeholder="Your own file number" />}</form.AppField>
      <form.AppField name="courtNumber">{(f) => <f.input label="Court number (optional)" placeholder="CRB 214/2026" />}</form.AppField>
      <form.AppField name="courtName">{(f) => <f.input label="Court (optional)" placeholder="Buganda Road Chief Magistrate's Court" />}</form.AppField>
      <form.AppField name="courtLevel">{(f) => <f.select label="Level of court (optional)" options={levels.map((l) => ({ value: l.id, label: l.label }))} placeholder="Not recorded" />}</form.AppField>
      <form.AppField name="offence">{(f) => <f.input label="Offence (optional)" />}</form.AppField>
      <form.AppField name="notes">{(f) => <f.textarea label="Notes (optional)" rows={3} />}</form.AppField>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label={existing ? 'Save changes' : 'Open matter'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}

/** Closing a matter needs how it ended in words. A matter with a hearing still
 * listed is refused: close or cancel that first. */
export function CloseMatterForm({ matterId, onSuccess, onDirtyChange }: { matterId: string; onSuccess?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const close = useCloseMatter()
  const form = useAppForm({
    defaultValues: { outcome: '' },
    validators: { onSubmit: ({ value }) => (value.outcome.trim() ? undefined : 'Record how the matter ended.') },
    onSubmit: async ({ value }) => {
      try {
        await close.mutateAsync({ id: matterId, outcome: value.outcome })
        t.success('Matter closed')
        onSuccess?.()
      } catch (error) {
        t.error('Could not close the matter', { description: messageOf(error) })
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
      <form.AppField name="outcome">{(f) => <f.textarea label="How the matter ended" rows={4} placeholder="Acquitted, convicted and sentenced to..., withdrawn, appeal lodged..." />}</form.AppField>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Close matter" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
