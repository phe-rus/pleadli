import { messageOf } from '@/lib/api'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { SubmitButton } from '@/components/submit-button'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useMarkExhibit, useUpdateExhibit } from './queries'
import { exhibitStatuses, producers, type Exhibit } from './schema'

type PanelProps = { onSuccess?: () => void; onDirtyChange?: (dirty: boolean) => void }
const formClass = 'flex flex-1 flex-col gap-4 overflow-y-auto p-4'

/** Marking an exhibit: who produced it and what it is. It is given the next
 * label for that side (P1, D1, C1). */
export function MarkExhibitForm({ caseId, sittingId = null, defaultWitness = '', onSuccess, onDirtyChange }: PanelProps & { caseId: string; sittingId?: string | null; defaultWitness?: string }) {
  const mark = useMarkExhibit()
  const form = useAppForm({
    defaultValues: { producedBy: 'prosecution', description: '', witness: defaultWitness },
    validators: { onSubmit: ({ value }) => (value.description.trim() ? undefined : 'Describe the exhibit.') },
    onSubmit: async ({ value }) => {
      try {
        const exhibit = await mark.mutateAsync({ caseId, input: { sittingId, producedBy: value.producedBy, description: value.description, witness: value.witness.trim() || null } })
        t.success(`Marked ${exhibit.label}`)
        onSuccess?.()
      } catch (error) {
        t.error('Could not mark the exhibit', { description: messageOf(error) })
      }
    },
  })
  useReportDirty(form, onDirtyChange)

  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="producedBy">{(f) => <f.select label="Produced by" options={producers.map((p) => ({ value: p.id, label: p.label }))} />}</form.AppField>
      <form.AppField name="description">{(f) => <f.textarea label="What it is" rows={3} placeholder="A panga, recovered at the scene" />}</form.AppField>
      <form.AppField name="witness">{(f) => <f.input label="Produced through (optional)" placeholder="PW1 Opio Charles" />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label="Mark exhibit" />
      </DrawerFooter>
    </form>
  )
}

/** What the court did with an exhibit, and a note. */
export function ExhibitRulingForm({ exhibit, onSuccess, onDirtyChange }: PanelProps & { exhibit: Exhibit }) {
  const update = useUpdateExhibit()
  const form = useAppForm({
    defaultValues: { description: exhibit.description, witness: exhibit.witness ?? '', status: exhibit.status, note: exhibit.note ?? '' },
    validators: { onSubmit: ({ value }) => (value.description.trim() ? undefined : 'Describe the exhibit.') },
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync({ id: exhibit.id, input: { description: value.description, witness: value.witness.trim() || null, status: value.status, note: value.note.trim() || null } })
        t.success(`${exhibit.label} updated`)
        onSuccess?.()
      } catch (error) {
        t.error('Could not update the exhibit', { description: messageOf(error) })
      }
    },
  })
  useReportDirty(form, onDirtyChange)

  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="status">{(f) => <f.select label="The court's ruling" options={exhibitStatuses.map((s) => ({ value: s.id, label: s.label }))} />}</form.AppField>
      <form.AppField name="description">{(f) => <f.textarea label="What it is" rows={3} />}</form.AppField>
      <form.AppField name="witness">{(f) => <f.input label="Produced through (optional)" />}</form.AppField>
      <form.AppField name="note">{(f) => <f.textarea label="Note (optional)" rows={2} />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label="Save" />
      </DrawerFooter>
    </form>
  )
}
