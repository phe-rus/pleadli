import * as m from '@/paraglide/messages'
import { officersOptions } from '@/features/officers'
import { useAppForm } from '@pleadli/forms-tables/forms'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@pleadli/ui/combobox'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useCreateShiftHandover } from './queries'
import { createShiftHandoverSchema } from './schema'

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export type HandoverFormProps = {
  onSuccess?: () => void
}

/** Officers are already a small, fully-loaded list (see
 * `BackupDispatchIndicator`'s own `officersOptions()` use) — filtered
 * client-side by name or badge number, same search-as-you-type feel as
 * `PersonPicker` without needing a dedicated server search endpoint. */
function OfficerCombobox({
  value,
  onValueChange,
  placeholder,
}: {
  value: string | null
  onValueChange: (id: string | null) => void
  placeholder: string
}) {
  const [query, setQuery] = useState('')
  const { data: officers = [] } = useQuery(officersOptions())
  const filtered = officers.filter((o) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return o.name.toLowerCase().includes(q) || (o.badgeNumber ?? '').toLowerCase().includes(q)
  })

  return (
    <Combobox value={value} onValueChange={onValueChange} inputValue={query} onInputValueChange={setQuery}>
      <ComboboxInput className="rounded!" placeholder={placeholder} showClear>
        <ComboboxContent>
          <ComboboxList>
            {filtered.map((officer) => (
              <ComboboxItem key={officer.id} value={officer.id}>
                {officer.name}{officer.badgeNumber ? ` (${officer.badgeNumber})` : ''}
              </ComboboxItem>
            ))}
            <ComboboxEmpty>{m["shift_log.no_matching"]()}</ComboboxEmpty>
          </ComboboxList>
        </ComboboxContent>
      </ComboboxInput>
    </Combobox>
  )
}

export function HandoverForm({ onSuccess }: HandoverFormProps) {
  const createHandover = useCreateShiftHandover()

  const form = useAppForm({
    defaultValues: {
      outgoingOfficerId: null as string | null,
      incomingOfficerId: '',
      unit: '',
      notes: '',
      handedOverAt: toDatetimeLocal(Date.now()),
    },
    onSubmit: async ({ value, formApi }) => {
      const parsed = createShiftHandoverSchema.safeParse({
        ...value,
        handedOverAt: new Date(value.handedOverAt).getTime(),
      })
      if (!parsed.success) {
        t.error(m["shift_log.incoming_required"]())
        return
      }
      try {
        await createHandover.mutateAsync(parsed.data)
        t.success(m["shift_log.handover_logged"]())
        formApi.reset()
        onSuccess?.()
      } catch {
        t.error(m["shift_log.handover_failed"](), { description: m["common.try_again"]() })
      }
    },
  })

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.AppField name="outgoingOfficerId">
          {(f) => (
            <Field>
              <FieldLabel>{m["shift_log.outgoing"]()}</FieldLabel>
              <OfficerCombobox value={f.state.value} onValueChange={f.handleChange} placeholder={m["shift_log.outgoing_placeholder"]()} />
            </Field>
          )}
        </form.AppField>

        <form.AppField name="incomingOfficerId">
          {(f) => (
            <Field>
              <FieldLabel>{m["shift_log.incoming"]()}</FieldLabel>
              <OfficerCombobox value={f.state.value || null} onValueChange={(v) => f.handleChange(v ?? '')} placeholder={m["shift_log.incoming_placeholder"]()} />
            </Field>
          )}
        </form.AppField>

        <form.AppField name="unit">{(f) => <f.input label={m["shift_log.unit_optional"]()} />}</form.AppField>

        <form.AppField name="handedOverAt">
          {(f) => (
            <Field>
              <FieldLabel>{m["shift_log.handover_time"]()}</FieldLabel>
              <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>

        <form.AppField name="notes">{(f) => <f.textarea label={m["shift_log.what_happened"]()} placeholder={m["shift_log.what_placeholder"]()} />}</form.AppField>
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m["shift_log.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
