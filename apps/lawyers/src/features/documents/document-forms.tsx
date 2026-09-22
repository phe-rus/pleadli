import { DateField } from '@/components/date-field'
import { SubmitButton } from '@/components/submit-button'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateDocument, useFileDocument } from './queries'
import { documentKinds, type LawyerDocument } from './schema'

/** Starting a document in a matter. You write it in its own page. */
export function DocumentCreateForm({ matterId, onSuccess, onDirtyChange }: { matterId: string; onSuccess?: (document: LawyerDocument) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const create = useCreateDocument()
  const form = useAppForm({
    defaultValues: { kind: 'submissions', title: '' },
    validators: { onSubmit: ({ value }) => (value.title.trim() ? undefined : 'Give the document a title.') },
    onSubmit: async ({ value }) => {
      try {
        const document = await create.mutateAsync({ matterId, kind: value.kind, title: value.title })
        t.success('Draft started')
        onSuccess?.(document)
      } catch (error) {
        t.error('Could not start the draft', { description: messageOf(error) })
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
      <form.AppField name="kind">{(f) => <f.select label="Kind" options={documentKinds.map((k) => ({ value: k.id, label: k.label }))} />}</form.AppField>
      <form.AppField name="title">{(f) => <f.input label="Title" placeholder="Application for bail pending trial" />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label="Start draft" />
      </DrawerFooter>
    </form>
  )
}

/** Filing: the day it was put before the court or sent, and to whom. Filing gives
 * the document a reference and freezes it. */
export function FileForm({ document, onSuccess }: { document: LawyerDocument; onSuccess?: () => void }) {
  const file = useFileDocument()
  const form = useAppForm({
    defaultValues: { filedOn: toIsoDay(Date.now()), filedWith: '' },
    validators: { onSubmit: ({ value }) => (fromDateInput(value.filedOn) ? undefined : 'Choose the day it was filed.') },
    onSubmit: async ({ value }) => {
      try {
        await file.mutateAsync({ id: document.id, filedOn: fromDateInput(value.filedOn) ?? 0, filedWith: value.filedWith.trim() || null })
        t.success('Filed')
        onSuccess?.()
      } catch (error) {
        t.error('It cannot be filed yet', { description: messageOf(error) })
      }
    },
  })

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <p>Filing gives the document a reference and freezes it. It can be printed, and replaced by a new document, but never edited.</p>
      <form.AppField name="filedOn">{(f) => <DateField label="Filed on" value={f.state.value} onChange={f.handleChange} />}</form.AppField>
      <form.AppField name="filedWith">{(f) => <f.input label="Filed with (optional)" placeholder="The court, the registrar, the prison" />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label="File" />
      </DrawerFooter>
    </form>
  )
}
