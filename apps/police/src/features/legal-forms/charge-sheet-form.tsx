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
        t.success(chargeSheet ? 'Charge sheet updated' : 'Charge sheet drawn')
        if (!chargeSheet) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(chargeSheet ? 'Could not update charge sheet' : 'Could not draw up charge sheet', {
          description: 'Please try again.',
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
              <FieldLabel>Case</FieldLabel>
              <Select
                items={cases.map((c: Case) => ({ value: c.id, label: `${c.reference}: ${c.summary}` }))}
                value={f.state.value}
                onValueChange={(value) => f.handleChange(value ?? f.state.value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select case" />
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
              <FieldLabel>Accused</FieldLabel>
              <PersonPicker value={f.state.value} onValueChange={f.handleChange} />
            </Field>
          )}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="offence">
            {(f) => <f.input label="Statement of the offence" placeholder="e.g. Theft" />}
          </form.AppField>
          <form.AppField name="statutorySection">
            {(f) => <f.input label="Statutory section" placeholder="e.g. s.254, Penal Code Act" />}
          </form.AppField>
        </div>

        <form.AppField name="particulars">
          {(f) => (
            <Field>
              <FieldLabel>Particulars of the offence</FieldLabel>
              <Textarea
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
                rows={4}
                placeholder="Time, place, conduct, and subject matter. Only what's necessary to give the accused reasonable notice of the charge."
              />
            </Field>
          )}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="chargedAt">
            {(f) => (
              <Field>
                <FieldLabel>Date charge preferred</FieldLabel>
                <Input
                  type="datetime-local"
                  value={f.state.value}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
              </Field>
            )}
          </form.AppField>
          <form.AppField name="officerId">
            {(f) => <OfficerPicker label="Preferring officer" value={f.state.value} onValueChange={f.handleChange} />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.officerId}>
            {(officerId) =>
              officerId ? null : (
                <>
                <form.AppField name="officerName">{(f) => <f.input label="Name" />}</form.AppField>
                </>
              )
            }
          </form.Subscribe>
        </div>

        <form.AppField name="stationName">
          {(f) => <f.input label="Station" placeholder="e.g. Central Police Station" />}
        </form.AppField>

        <AttachmentsField entityType={entityTypes.chargeSheet} entityId={chargeSheet?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={chargeSheet ? 'Save changes' : 'Draw up charge sheet'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
