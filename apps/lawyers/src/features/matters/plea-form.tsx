import { DateField } from '@/components/date-field'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useSavePlea } from './queries'
import type { Plea } from './schema'

export const pleaStatuses = [
  { id: 'considering', label: 'Considering' },
  { id: 'negotiating', label: 'Negotiating' },
  { id: 'agreed', label: 'Agreement reached' },
  { id: 'confirmed', label: 'Confirmed before the court' },
  { id: 'abandoned', label: 'Abandoned' },
] as const
export const pleaStatusLabel = (id: string) => pleaStatuses.find((s) => s.id === id)?.label ?? id

/** The defence side of a plea negotiation. An agreement counts as reached only
 * once it was explained to the accused, by the advocate or a justice of the peace
 * (the research found that duty is not the prosecutor's). Confirmation before the
 * court follows signing. The form asks for these dates because the record refuses
 * a status it cannot support. */
export function PleaForm({ matterId, existing, onSuccess, onDirtyChange }: { matterId: string; existing: Plea | null; onSuccess?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const save = useSavePlea()
  const day = (ms: number | null | undefined) => (ms ? toIsoDay(ms) : '')
  const form = useAppForm({
    defaultValues: {
      status: existing?.status ?? 'considering',
      summary: existing?.summary ?? '',
      explainedOn: day(existing?.explainedOn),
      explainedBy: existing?.explainedBy ?? '',
      signedOn: day(existing?.signedOn),
      confirmedOn: day(existing?.confirmedOn),
      abandonedReason: existing?.abandonedReason ?? '',
    },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({
          matterId,
          input: {
            status: value.status,
            summary: value.summary.trim() || null,
            explainedOn: fromDateInput(value.explainedOn),
            explainedBy: value.explainedBy || null,
            signedOn: fromDateInput(value.signedOn),
            confirmedOn: fromDateInput(value.confirmedOn),
            abandonedReason: value.abandonedReason.trim() || null,
          },
        })
        t.success('Plea negotiation saved')
        onSuccess?.()
      } catch (error) {
        t.error('Could not save it', { description: messageOf(error) })
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
      <form.AppField name="status">{(f) => <f.select label="Where it stands" options={pleaStatuses.map((s) => ({ value: s.id, label: s.label }))} />}</form.AppField>
      <form.AppField name="summary">{(f) => <f.textarea label="What is proposed (optional)" rows={3} />}</form.AppField>
      <form.AppField name="explainedOn">{(f) => <DateField label="Agreement explained to the accused on" value={f.state.value} onChange={f.handleChange} description="Required before an agreement counts as reached." />}</form.AppField>
      <form.AppField name="explainedBy">
        {(f) => (
          <f.select
            label="Explained by"
            options={[
              { value: 'advocate', label: 'The advocate' },
              { value: 'justice_of_the_peace', label: 'A justice of the peace' },
            ]}
            placeholder="Not recorded"
          />
        )}
      </form.AppField>
      <form.AppField name="signedOn">{(f) => <DateField label="Signed on" value={f.state.value} onChange={f.handleChange} />}</form.AppField>
      <form.AppField name="confirmedOn">{(f) => <DateField label="Confirmed before the court on" value={f.state.value} onChange={f.handleChange} />}</form.AppField>
      <form.Subscribe selector={(state) => state.values.status}>
        {(status) => status === 'abandoned' && <form.AppField name="abandonedReason">{(f) => <f.textarea label="Why it was abandoned" rows={2} />}</form.AppField>}
      </form.Subscribe>
      <p className="text-muted-foreground">This records your side only. It is not the prosecutor&rsquo;s record, and the wording of the Rules has not been re-read against it.</p>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Save" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
