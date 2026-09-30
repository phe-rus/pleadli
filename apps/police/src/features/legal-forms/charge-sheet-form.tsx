import * as m from '@/paraglide/messages'
import { OfficerPicker } from '@/features/officers'
import { PersonPicker } from '@/components/person-picker'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { casesOptions, type Case } from '@/features/cases'
import { stationProfileOptions } from '@/features/station-admin'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Textarea } from '@pleadli/ui/textarea'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useCreateChargeSheet, useUpdateChargeSheet } from './queries'
import { createChargeSheetSchema, type ChargeSheet } from './schema'

export type ChargeSheetFormProps = {
  chargeSheet?: ChargeSheet
  onSuccess?: (chargeSheet: ChargeSheet) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ChargeSheetForm({ chargeSheet, onSuccess, onDirtyChange }: ChargeSheetFormProps) {
  const createChargeSheet = useCreateChargeSheet()
  const updateChargeSheet = useUpdateChargeSheet()
  const { data: cases } = useSuspenseQuery(casesOptions(''))
  const { data: stationProfile } = useSuspenseQuery(stationProfileOptions())

  const form = useAppForm({
    defaultValues: {
      caseId: chargeSheet?.caseId ?? '',
      accusedPersonId: chargeSheet?.accusedPersonId ?? (null as string | null),
      offence: chargeSheet?.offence ?? '',
      statutorySection: chargeSheet?.statutorySection ?? '',
      particulars: chargeSheet?.particulars ?? '',
      chargedAt: chargeSheet ? toDatetimeLocal(chargeSheet.chargedAt) : toDatetimeLocal(Date.now()),
      officerId: chargeSheet?.officerId ?? (null as string | null),
      officerName: chargeSheet?.officerName ?? '',
      // Prefilled from the canonical Station Profile so the officer isn't
      // retyping it on every charge sheet — still a plain editable field,
      // since a charge sheet is its own historical record once saved.
      stationName: chargeSheet?.stationName ?? stationProfile?.name ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createChargeSheetSchema.safeParse({
          ...value,
          chargedAt: new Date(value.chargedAt).getTime(),
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, chargedAt: new Date(value.chargedAt).getTime() }
        const result = chargeSheet
          ? await updateChargeSheet.mutateAsync({ id: chargeSheet.id, input })
          : await createChargeSheet.mutateAsync(input)
        t.success(chargeSheet ? m["charge_sheet.updated"]() : m["charge_sheet.drawn"]())
        if (!chargeSheet) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(chargeSheet ? m["charge_sheet.update_failed"]() : m["charge_sheet.draw_failed"](), {
          description: m["common.try_again"](),
        })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.AppField name="caseId">
          {(f) => (
            <Field>
              <FieldLabel>{m["common.case"]()}</FieldLabel>
              <Select
                items={cases.map((c: Case) => ({ value: c.id, label: `${c.reference}: ${c.summary}` }))}
                value={f.state.value}
                onValueChange={(value) => f.handleChange(value ?? f.state.value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m["common.select_case"]()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {cases.map((c: Case) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.reference}: {c.summary}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.AppField>

        <form.AppField name="accusedPersonId">
          {(f) => (
            <Field>
              <FieldLabel>{m["common.accused"]()}</FieldLabel>
              <PersonPicker value={f.state.value} onValueChange={f.handleChange} />
            </Field>
          )}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="offence">
            {(f) => <f.input label={m["charge_sheet.offence"]()} placeholder={m["charge_sheet.offence_placeholder"]()} />}
          </form.AppField>
          <form.AppField name="statutorySection">
            {(f) => <f.input label={m["charge_sheet.section"]()} placeholder={m["charge_sheet.section_placeholder"]()} />}
          </form.AppField>
        </div>

        <form.AppField name="particulars">
          {(f) => (
            <Field>
              <FieldLabel>{m["charge_sheet.particulars"]()}</FieldLabel>
              <Textarea
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
                rows={4}
                placeholder={m["charge_sheet.particulars_placeholder"]()}
              />
            </Field>
          )}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="chargedAt">
            {(f) => (
              <Field>
                <FieldLabel>{m["charge_sheet.charged_at"]()}</FieldLabel>
                <Input
                  type="datetime-local"
                  value={f.state.value}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
              </Field>
            )}
          </form.AppField>
          <form.AppField name="officerId">
            {(f) => <OfficerPicker label={m["charge_sheet.preferring_officer"]()} value={f.state.value} onValueChange={f.handleChange} />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.officerId}>
            {(officerId) =>
              officerId ? null : (
                <>
                <form.AppField name="officerName">{(f) => <f.input label={m["common.name"]()} />}</form.AppField>
                </>
              )
            }
          </form.Subscribe>
        </div>

        <form.AppField name="stationName">
          {(f) => <f.input label={m["common.station"]()} placeholder={m["charge_sheet.station_placeholder"]()} />}
        </form.AppField>

        <AttachmentsField entityType={entityTypes.chargeSheet} entityId={chargeSheet?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={chargeSheet ? m["common.save_changes"]() : m["charge_sheet.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
