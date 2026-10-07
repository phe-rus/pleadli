import { DateField } from '@/components/date-field'
import { SubmitButton } from '@/components/submit-button'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import * as m from '@/paraglide/messages'
import { parseDuration, useAddTime } from './queries'

/** Time spent on a matter. Whether it is billed follows how you came to act, so
 * this only records it: the time and what it was for. */
export function TimeForm({ matterId, onSuccess, onDirtyChange }: { matterId: string; onSuccess?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const add = useAddTime()
  const form = useAppForm({
    defaultValues: { workedOn: toIsoDay(Date.now()), duration: '', description: '' },
    validators: {
      onSubmit: ({ value }) => {
        if (parseDuration(value.duration) == null) return m["time.form.bad_duration"]()
        if (!value.description.trim()) return m["time.form.needs_description"]()
        return undefined
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await add.mutateAsync({ matterId, input: { workedOn: fromDateInput(value.workedOn) ?? 0, minutes: parseDuration(value.duration) ?? 0, description: value.description } })
        t.success(m["time.form.recorded"]())
        formApi.reset()
        onSuccess?.()
      } catch (error) {
        t.error(m["time.form.failed"](), { description: messageOf(error) })
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
      <form.AppField name="workedOn">{(f) => <DateField label={m["time.form.day"]()} value={f.state.value} onChange={f.handleChange} />}</form.AppField>
      <form.AppField name="duration">{(f) => <f.input label={m["time.form.time"]()} placeholder={m["time.form.time_placeholder"]()} />}</form.AppField>
      <form.AppField name="description">{(f) => <f.textarea label={m["time.form.for"]()} rows={3} />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label={m["time.form.submit"]()} />
      </DrawerFooter>
    </form>
  )
}
