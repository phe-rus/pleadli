import { DateField } from '@/components/date-field'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useClientChoices } from '../clients/queries'
import { inCourt, matterTypeLabel, useEnabledMatterTypes } from '@/features/matter-types'
import * as m from '@/paraglide/messages'
import { ConflictCheck } from './matter-parts'
import { useAddParty, useCloseMatter, useCreateMatter, useUpdateMatter } from './queries'
import { engagements, levels, matterFormSchema, type Matter } from './schema'

/** Opening a matter. The kind of matter (a civil suit, a land transaction, a
 * defence) decides its stages and which fields apply; only the kinds of work
 * the practice has switched on are offered. How you came to act matters: an
 * appointment at the expense of the state brings dated duties, tracked as
 * tasks. The reference is your own; the court number is the court's. As the
 * client and the other side are named, the conflict check runs on each. */
export function MatterForm({ existing, defaultClientId, onSuccess, onDirtyChange }: { existing?: Matter; defaultClientId?: string; onSuccess?: (matter: Matter) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const create = useCreateMatter()
  const update = useUpdateMatter()
  const addParty = useAddParty()
  const { data: clients } = useClientChoices()
  const types = useEnabledMatterTypes()

  const form = useAppForm({
    defaultValues: {
      matterType: existing?.matterType ?? types[0]?.id ?? '',
      clientId: existing?.clientId ?? defaultClientId ?? '',
      title: existing?.title ?? '',
      otherSide: '',
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
        const parsed = matterFormSchema().safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      const court = inCourt(value.matterType)
      const input = {
        clientId: value.clientId,
        title: value.title,
        ourRef: value.ourRef.trim() || null,
        courtNumber: court ? value.courtNumber.trim() || null : null,
        courtName: court ? value.courtName.trim() || null : null,
        courtLevel: court ? value.courtLevel || null : null,
        offence: value.matterType === 'criminal_defence' || value.matterType === 'private_prosecution' ? value.offence.trim() || null : null,
        engagement: value.engagement,
        appointedOn: value.engagement === 'state_appointed' ? fromDateInput(value.appointedOn) : null,
        notes: value.notes.trim() || null,
        ...(existing ? {} : { matterType: value.matterType }),
      }
      try {
        const matter = existing ? await update.mutateAsync({ id: existing.id, input }) : await create.mutateAsync(input)
        if (!existing && value.otherSide.trim()) {
          await addParty.mutateAsync({ matterId: matter.id, input: { role: 'opposing_party', name: value.otherSide.trim(), organisation: null, contact: null, notes: null } })
        }
        t.success(existing ? m["matter.form.updated"]() : m["matter.form.opened"]())
        if (!existing) formApi.reset()
        onSuccess?.(matter)
      } catch (error) {
        t.error(m["matter.form.save_failed"](), { description: messageOf(error) })
      }
    },
  })
  useReportDirty(form, onDirtyChange)

  const choices = (clients ?? []).map((c) => ({ value: c.id, label: c.name }))
  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? ''

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {!existing && (
        <form.AppField name="matterType">
          {(f) => <f.select label={m["matter.form.type"]()} options={types.map((ty) => ({ value: ty.id, label: matterTypeLabel(ty.id) }))} placeholder={m["matter.form.type_placeholder"]()} />}
        </form.AppField>
      )}
      {!existing && types.length === 0 && <p className="text-muted-foreground">{m["matter.form.no_types"]()}</p>}
      {choices.length === 0 && <p className="text-muted-foreground">{m["matter.form.no_clients"]()}</p>}
      <form.AppField name="clientId">{(f) => <f.select label={m["matter.form.client"]()} options={choices} placeholder={m["matter.form.client_placeholder"]()} />}</form.AppField>
      {!existing && <form.Subscribe selector={(state) => state.values.clientId}>{(id) => id && <ConflictCheck name={clientName(id)} asClient />}</form.Subscribe>}
      <form.AppField name="title">{(f) => <f.input label={m["matter.form.title"]()} placeholder={m["matter.form.title_placeholder"]()} />}</form.AppField>
      {!existing && (
        <>
          <form.AppField name="otherSide">{(f) => <f.input label={m["matter.form.other_side"]()} placeholder={m["matter.form.other_side_placeholder"]()} />}</form.AppField>
          <form.Subscribe selector={(state) => state.values.otherSide}>{(name) => <ConflictCheck name={name} />}</form.Subscribe>
        </>
      )}
      <form.AppField name="engagement">{(f) => <f.select label={m["matter.form.engagement"]()} options={engagements.map((e) => ({ value: e.id, label: e.label }))} />}</form.AppField>
      <form.Subscribe selector={(state) => state.values.engagement}>
        {(engagement) =>
          engagement === 'state_appointed' && (
            <form.AppField name="appointedOn">
              {(f) => <DateField label={m["matter.form.appointed_on"]()} value={f.state.value} onChange={f.handleChange} description={m["matter.form.appointed_on_hint"]()} />}
            </form.AppField>
          )
        }
      </form.Subscribe>
      <form.AppField name="ourRef">{(f) => <f.input label={m["matter.form.our_ref"]()} placeholder={m["matter.form.our_ref_placeholder"]()} />}</form.AppField>
      <form.Subscribe selector={(state) => state.values.matterType}>
        {(type) => (
          <>
            {inCourt(type) && (
              <>
                <form.AppField name="courtNumber">{(f) => <f.input label={m["matter.form.court_number"]()} placeholder={type === 'criminal_defence' ? 'CRB 214/2026' : 'HCCS 88/2026'} />}</form.AppField>
                <form.AppField name="courtName">{(f) => <f.input label={m["matter.form.court_name"]()} />}</form.AppField>
                <form.AppField name="courtLevel">{(f) => <f.select label={m["matter.form.court_level"]()} options={levels.map((l) => ({ value: l.id, label: l.label }))} placeholder={m["matter.form.not_recorded"]()} />}</form.AppField>
              </>
            )}
            {(type === 'criminal_defence' || type === 'private_prosecution') && <form.AppField name="offence">{(f) => <f.input label={m["matter.form.offence"]()} />}</form.AppField>}
          </>
        )}
      </form.Subscribe>
      <form.AppField name="notes">{(f) => <f.textarea label={m["matter.form.notes"]()} rows={3} />}</form.AppField>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label={existing ? m["matter.form.save"]() : m["matter.form.open"]()} />
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
