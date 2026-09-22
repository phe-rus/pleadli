import { SubmitButton } from '@/components/submit-button'
import { messageOf } from '@/lib/api'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useAddLibraryItem, useUpdateLibraryItem } from './queries'
import { libraryKinds, type LibraryItem } from './schema'

/** Keeping a text on this computer. Where it came from and its licence are
 * recorded with it, so anyone reading it later can check it against the source:
 * nothing here is bundled or vouched for by the application. */
export function LibraryForm({ existing, onSuccess, onDirtyChange }: { existing?: LibraryItem; onSuccess?: (item: LibraryItem) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const add = useAddLibraryItem()
  const update = useUpdateLibraryItem()
  const form = useAppForm({
    defaultValues: {
      kind: existing?.kind ?? 'statute',
      title: existing?.title ?? '',
      citation: existing?.citation ?? '',
      source: existing?.source ?? '',
      licence: existing?.licence ?? '',
      body: existing?.body ?? '',
    },
    validators: {
      onSubmit: ({ value }) => (!value.title.trim() ? 'Give the text a title.' : !value.body.trim() ? 'Paste the text to keep.' : undefined),
    },
    onSubmit: async ({ value }) => {
      const input = { kind: value.kind, title: value.title, citation: value.citation.trim() || null, source: value.source.trim() || null, licence: value.licence.trim() || null, body: value.body }
      try {
        const item = existing ? await update.mutateAsync({ id: existing.id, input }) : await add.mutateAsync(input)
        t.success(existing ? 'Text updated' : 'Text kept')
        onSuccess?.(item)
      } catch (error) {
        t.error('Could not keep the text', { description: messageOf(error) })
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
      <form.AppField name="kind">{(f) => <f.select label="Kind" options={libraryKinds.map((k) => ({ value: k.id, label: k.label }))} />}</form.AppField>
      <form.AppField name="title">{(f) => <f.input label="Title" placeholder="Magistrates Courts Act" />}</form.AppField>
      <form.AppField name="citation">{(f) => <f.input label="Citation (optional)" placeholder="Cap 19" />}</form.AppField>
      <form.AppField name="source">{(f) => <f.input label="Where it came from (optional)" placeholder="ULII, the Judiciary's website, the gazette" />}</form.AppField>
      <form.AppField name="licence">{(f) => <f.input label="Licence (optional)" placeholder="CC-BY" />}</form.AppField>
      <form.AppField name="body">{(f) => <f.textarea label="Text" rows={12} placeholder="Paste the text here." />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label={existing ? 'Save changes' : 'Keep text'} />
      </DrawerFooter>
    </form>
  )
}
