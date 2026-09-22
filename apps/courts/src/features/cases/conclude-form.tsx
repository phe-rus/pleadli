import { messageOf } from '@/lib/api'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useConcludeCase } from './queries'

/** Ending a case needs the outcome in words. A case with a sitting still
 * scheduled is refused: close or cancel that sitting first. */
export function ConcludeForm({ caseId, onSuccess, onDirtyChange }: { caseId: string; onSuccess?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const conclude = useConcludeCase()
  const form = useAppForm({
    defaultValues: { outcome: '' },
    validators: { onSubmit: ({ value }) => (value.outcome.trim() ? undefined : 'Record how the case ended.') },
    onSubmit: async ({ value }) => {
      try {
        await conclude.mutateAsync({ id: caseId, outcome: value.outcome })
        t.success('Case concluded')
        onSuccess?.()
      } catch (error) {
        t.error('Could not conclude the case', { description: messageOf(error) })
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
      <form.AppField name="outcome">{(f) => <f.textarea label="How the case ended" rows={4} placeholder="Convicted and sentenced to..., acquitted, withdrawn, dismissed..." />}</form.AppField>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Conclude case" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
