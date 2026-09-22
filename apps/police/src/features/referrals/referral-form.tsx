import { OfficerPicker } from '@/features/officers'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { casesOptions, type Case } from '@/features/cases'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Textarea } from '@pleadli/ui/textarea'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useCreateReferral, useUpdateReferral } from './queries'
import { referralDestinationTypes, referralStatuses, createReferralSchema, type Referral } from './schema'

export type ReferralFormProps = {
  referral?: Referral
  onSuccess?: (referral: Referral) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ReferralForm({ referral, onSuccess, onDirtyChange }: ReferralFormProps) {
  const createReferral = useCreateReferral()
  const updateReferral = useUpdateReferral()
  const { data: cases } = useSuspenseQuery(casesOptions(''))

  const form = useAppForm({
    defaultValues: {
      caseId: referral?.caseId ?? '',
      destinationType: referral?.destinationType ?? 'dpp',
      destinationName: referral?.destinationName ?? '',
      referredAt: referral ? toDatetimeLocal(referral.referredAt) : toDatetimeLocal(Date.now()),
      status: referral?.status ?? 'pending',
      officerId: referral?.officerId ?? (null as string | null),
      officerName: referral?.officerName ?? '',
      notes: referral?.notes ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createReferralSchema.safeParse({
          ...value,
          referredAt: new Date(value.referredAt).getTime(),
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, referredAt: new Date(value.referredAt).getTime() }
        const result = referral
          ? await updateReferral.mutateAsync({ id: referral.id, input })
          : await createReferral.mutateAsync(input)
        t.success(referral ? 'Referral updated' : 'Referral recorded')
        if (!referral) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(referral ? 'Could not update referral' : 'Could not record referral', {
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

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="destinationType">
            {(f) => <f.select label="Destination type" options={[...referralDestinationTypes]} />}
          </form.AppField>
          <form.AppField name="destinationName">
            {(f) => <f.input label="Destination" placeholder="e.g. Resident State Attorney, Buganda Road" />}
          </form.AppField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="referredAt">
            {(f) => (
              <Field>
                <FieldLabel>Referred at</FieldLabel>
                <Input
                  type="datetime-local"
                  value={f.state.value}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
              </Field>
            )}
          </form.AppField>
          <form.AppField name="status">
            {(f) => <f.select label="Status" options={[...referralStatuses]} />}
          </form.AppField>
        </div>

        <form.AppField name="officerId">
            {(f) => <OfficerPicker label="Referring officer" value={f.state.value} onValueChange={f.handleChange} />}
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

        <form.AppField name="notes">
          {(f) => (
            <Field>
              <FieldLabel>Notes (optional)</FieldLabel>
              <Textarea value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} rows={3} />
            </Field>
          )}
        </form.AppField>

        <AttachmentsField entityType={entityTypes.referral} entityId={referral?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={referral ? 'Save changes' : 'Record referral'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
