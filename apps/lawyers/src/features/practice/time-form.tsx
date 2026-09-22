import { DateField } from '@/components/date-field'
import { SubmitButton } from '@/components/submit-button'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { parseDuration, useAddTime } from './queries'

/** Time spent on a matter. Whether it is billed follows how you came to act, so
 * this only records it: the time and what it was for. */
export function TimeForm({ matterId, onSuccess, onDirtyChange }: { matterId: string; onSuccess?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const add = useAddTime()
  const form = useAppForm({
    defaultValues: { workedOn: toIsoDay(Date.now()), duration: '', description: '' },
    validators: {
      onSubmit: ({ value }) => {
        if (parseDuration(value.duration) == null) return 'Give the time as minutes, or like 1h30.'
        if (!value.description.trim()) return 'Say what the time was spent on.'
        return undefined
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await add.mutateAsync({ matterId, input: { workedOn: fromDateInput(value.workedOn) ?? 0, minutes: parseDuration(value.duration) ?? 0, description: value.description } })
        t.success('Time recorded')
        formApi.reset()
        onSuccess?.()
      } catch (error) {
        t.error('Could not record the time', { description: messageOf(error) })
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
      <form.AppField name="workedOn">{(f) => <DateField label="Day" value={f.state.value} onChange={f.handleChange} />}</form.AppField>
      <form.AppField name="duration">{(f) => <f.input label="Time" placeholder="1h30, 90 or 45m" />}</form.AppField>
      <form.AppField name="description">{(f) => <f.textarea label="What it was for" rows={3} />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label="Record time" />
      </DrawerFooter>
    </form>
  )
}
