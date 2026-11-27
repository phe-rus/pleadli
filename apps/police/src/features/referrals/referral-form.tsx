import * as m from '@/paraglide/messages'
import { useMe } from '@/features/session'
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
import { listChargeSheets } from '@/features/legal-forms'
import { useEnclosures } from '@/features/paper/use-enclosures'
import { Button } from '@pleadli/ui/button'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useCreateReferral, useUpdateReferral } from './queries'
import { referralDestinationTypes, referralStatuses, createReferralSchema, type Referral } from './schema'

export type ReferralFormProps = {
  referral?: Referral
  onSuccess?: (referral: Referral) => void
  onDirtyChange?: (dirty: boolean) => void
  /** Opened from inside a case: the paper starts attached to it. */
  caseId?: string
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ReferralForm({ referral, caseId, onSuccess, onDirtyChange }: ReferralFormProps) {
  const createReferral = useCreateReferral()
  const updateReferral = useUpdateReferral()
  const { data: cases } = useSuspenseQuery(casesOptions(''))

  const { data: me } = useMe()
  const form = useAppForm({
    defaultValues: {
      caseId: referral?.caseId ?? caseId ?? '',
      destinationType: referral?.destinationType ?? 'dpp',
      destinationName: referral?.destinationName ?? '',
      referredAt: referral ? toDatetimeLocal(referral.referredAt) : toDatetimeLocal(Date.now()),
      status: referral?.status ?? 'pending',
      // A new record is taken, drawn up or granted by whoever is signed in; an edit keeps who was recorded.
      officerId: referral ? referral.officerId : (me?.officerId ?? (null as string | null)),
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
        t.success(referral ? m["referrals.updated"]() : m["referrals.recorded"]())
        if (!referral) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(referral ? m["referrals.update_failed"]() : m["referrals.record_failed"](), {
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

        <form.Subscribe selector={(s) => [s.values.caseId, s.values.destinationType] as const}>
          {([caseId, destination]) => <NoChargeWarning caseId={caseId} destination={destination} />}
        </form.Subscribe>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="destinationType">
            {(f) => <f.select label={m["referrals.destination_type"]()} options={[...referralDestinationTypes]} />}
          </form.AppField>
          <form.AppField name="destinationName">
            {(f) => <f.input label={m["referrals.destination_label"]()} placeholder={m["referrals.destination_placeholder"]()} />}
          </form.AppField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="referredAt">
            {(f) => (
              <Field>
                <FieldLabel>{m["referrals.referred_at"]()}</FieldLabel>
                <Input
                  type="datetime-local"
                  value={f.state.value}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
              </Field>
            )}
          </form.AppField>
          <form.AppField name="status">
            {(f) => <f.select label={m["common.status"]()} options={[...referralStatuses]} />}
          </form.AppField>
        </div>

        <form.AppField name="officerId">
            {(f) => <OfficerPicker label={m["referrals.referring_officer"]()} value={f.state.value} onValueChange={f.handleChange} />}
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

        <form.Subscribe selector={(s) => s.values.caseId}>
          {(caseId) => (
            <form.AppField name="notes">
              {(f) => <Enclosures caseId={caseId} onAdd={(text) => f.handleChange(f.state.value ? `${f.state.value}\n${text}` : text)} />}
            </form.AppField>
          )}
        </form.Subscribe>

        <form.AppField name="notes">
          {(f) => (
            <Field>
              <FieldLabel>{m["common.notes_optional"]()}</FieldLabel>
              <Textarea value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} rows={3} />
            </Field>
          )}
        </form.AppField>

        <AttachmentsField entityType={entityTypes.referral} entityId={referral?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={referral ? m["common.save_changes"]() : m["referrals.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}

/** What goes with the referral: the case's statements and exhibits, which the officer can put into the notes. */
function Enclosures({ caseId, onAdd }: { caseId: string; onAdd: (text: string) => void }) {
  const { lines } = useEnclosures(caseId)
  if (!caseId) return null
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted px-3 py-2 text-sm">
      <p className="font-medium">{m['referrals.enclosed_title']()}</p>
      {lines.length === 0 ? (
        <p className="text-muted-foreground">{m['referrals.enclosed_none']()}</p>
      ) : (
        <>
          <ul className="list-disc pl-5">
            {lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onAdd(m['referrals.enclosed_text']({ list: lines.join('; ') }))}>
            {m['referrals.enclosed_add']()}
          </Button>
        </>
      )}
    </div>
  )
}

/** A referral to the prosecutor should carry a proposed charge, because the
 * prosecutor's file starts from it. Not a block: the prosecutor can add one. */
function NoChargeWarning({ caseId, destination }: { caseId: string; destination: string }) {
  const { data } = useQuery({ queryKey: ['charge-sheets', 'for-referral'], queryFn: () => listChargeSheets(''), staleTime: 15_000 })
  if (!caseId || destination !== 'dpp' || !data || data.some((c) => c.caseId === caseId)) return null
  return <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{m["referrals.no_charge_warning"]()}</p>
}
