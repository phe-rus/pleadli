import { DateField } from '@/components/date-field'
import { SubmitButton } from '@/components/submit-button'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateTask, useUpdateTask } from './queries'
import type { Task } from './schema'

/** A task of your own, with a due day if it has one. Duties that come from the
 * state-funded scheme are made by the application and are not edited here. */
export function TaskForm({ matterId = null, existing, onSuccess, onDirtyChange }: { matterId?: string | null; existing?: Task; onSuccess?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const create = useCreateTask()
  const update = useUpdateTask()
  const form = useAppForm({
    defaultValues: { title: existing?.title ?? '', detail: existing?.detail ?? '', dueOn: existing?.dueOn ? toIsoDay(existing.dueOn) : '' },
    validators: { onSubmit: ({ value }) => (value.title.trim() ? undefined : 'A task needs a title.') },
    onSubmit: async ({ value, formApi }) => {
      const input = { matterId: existing?.matterId ?? matterId, title: value.title, detail: value.detail.trim() || null, dueOn: fromDateInput(value.dueOn) }
      try {
        if (existing) await update.mutateAsync({ id: existing.id, input })
        else await create.mutateAsync(input)
        t.success(existing ? 'Task updated' : 'Task added')
        if (!existing) formApi.reset()
        onSuccess?.()
      } catch (error) {
        t.error('Could not save the task', { description: messageOf(error) })
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
      <form.AppField name="title">{(f) => <f.input label="Task" placeholder="Interview the second witness" />}</form.AppField>
      <form.AppField name="dueOn">{(f) => <DateField label="Due (optional)" value={f.state.value} onChange={f.handleChange} />}</form.AppField>
      <form.AppField name="detail">{(f) => <f.textarea label="Detail (optional)" rows={3} />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label={existing ? 'Save changes' : 'Add task'} />
      </DrawerFooter>
    </form>
  )
}
