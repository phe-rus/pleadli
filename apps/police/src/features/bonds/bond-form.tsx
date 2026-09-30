import * as m from '@/paraglide/messages'
import { OfficerPicker } from '@/features/officers'
import { PersonPicker } from '@/components/person-picker'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { casesOptions, type Case } from '@/features/cases'
import { custodyRecordsOptions, type CustodyRecord } from '@/features/custody'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Switch } from '@pleadli/ui/switch'
import { Textarea } from '@pleadli/ui/textarea'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useCreateBond, useUpdateBond } from './queries'
import { bondStatuses, createBondSchema, type Bond } from './schema'

export type BondFormProps = {
  bond?: Bond
  onSuccess?: (bond: Bond) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function BondForm({ bond, onSuccess, onDirtyChange }: BondFormProps) {
  const createBond = useCreateBond()
  const updateBond = useUpdateBond()
  const { data: cases } = useSuspenseQuery(casesOptions(''))
  const { data: custodyRecords } = useSuspenseQuery(custodyRecordsOptions(''))

  const form = useAppForm({
    defaultValues: {
      personId: bond?.personId ?? '',
      custodyId: bond?.custodyId ?? (null as string | null),
      caseId: bond?.caseId ?? (null as string | null),
      lockUpSerialNumber: bond?.lockUpSerialNumber ?? '',
      withSurety: bond?.withSurety ?? true,
      suretyName: bond?.suretyName ?? '',
      suretyContact: bond?.suretyContact ?? '',
      reportingSchedule: bond?.reportingSchedule ?? '',
      officerId: bond?.officerId ?? (null as string | null),
      officerName: bond?.officerName ?? '',
      officerRank: bond?.officerRank ?? '',
      status: bond?.status ?? 'active',
      grantedAt: bond ? toDatetimeLocal(bond.grantedAt) : toDatetimeLocal(Date.now()),
      notes: bond?.notes ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createBondSchema.safeParse({ ...value, grantedAt: new Date(value.grantedAt).getTime() })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, grantedAt: new Date(value.grantedAt).getTime() }
        const result = bond
          ? await updateBond.mutateAsync({ id: bond.id, input })
          : await createBond.mutateAsync(input)
        t.success(bond ? m["bonds.updated"]() : m["bonds.granted"]())
        if (!bond) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(bond ? m["bonds.update_failed"]() : m["bonds.grant_failed"](), { description: m["common.try_again"]() })
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
        <form.AppField name="personId">
          {(f) => (
            <Field>
              <FieldLabel>{m["bonds.person"]()}</FieldLabel>
              <PersonPicker value={f.state.value || null} onValueChange={(id) => f.handleChange(id ?? '')} />
            </Field>
          )}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="lockUpSerialNumber">
            {(f) => <f.input label={m["bonds.lock_up_serial"]()} placeholder={m["bonds.lock_up_placeholder"]()} />}
          </form.AppField>
          <form.AppField name="grantedAt">
            {(f) => (
              <Field>
                <FieldLabel>{m["bonds.granted_at"]()}</FieldLabel>
                <Input
                  type="datetime-local"
                  value={f.state.value}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
              </Field>
            )}
          </form.AppField>
        </div>

        <form.AppField name="withSurety">
          {(f) => (
            <Field orientation="horizontal">
              <Switch checked={f.state.value} onCheckedChange={f.handleChange} />
              <FieldLabel>{m["bonds.with_surety"]()}</FieldLabel>
            </Field>
          )}
        </form.AppField>

        <form.Subscribe selector={(state) => state.values.withSurety}>
          {(withSurety) =>
            withSurety && (
              <div className="grid grid-cols-2 gap-3">
                <form.AppField name="suretyName">
                  {(f) => <f.input label={m["bonds.surety_name"]()} />}
                </form.AppField>
                <form.AppField name="suretyContact">
                  {(f) => <f.input label={m["bonds.surety_contact"]()} />}
                </form.AppField>
              </div>
            )
          }
        </form.Subscribe>

        <form.AppField name="reportingSchedule">
          {(f) => (
            <Field>
              <FieldLabel>{m["bonds.reporting_schedule"]()}</FieldLabel>
              <Input
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
                placeholder={m["bonds.reporting_placeholder"]()}
              />
              <FieldDescription>{m["bonds.reporting_hint"]()}</FieldDescription>
            </Field>
          )}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="officerId">
            {(f) => <OfficerPicker label={m["bonds.granting_officer"]()} value={f.state.value} onValueChange={f.handleChange} />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.officerId}>
            {(officerId) =>
              officerId ? null : (
                <>
                <form.AppField name="officerName">{(f) => <f.input label={m["common.name"]()} />}</form.AppField>
                <form.AppField name="officerRank">{(f) => <f.input label={m["common.rank"]()} />}</form.AppField>
                </>
              )
            }
          </form.Subscribe>
        </div>

        <form.AppField name="status">
          {(f) => (
            <Field>
              <FieldLabel>{m["common.status"]()}</FieldLabel>
              <Select items={bondStatuses} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m["common.select_status"]()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {bondStatuses.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="custodyId">
            {(f) => (
              <Field>
                <FieldLabel>{m["bonds.related_custody"]()}</FieldLabel>
                <Select
                  items={[
                    { value: '', label: m["common.none"]() },
                    ...custodyRecords.map((c: CustodyRecord) => ({ value: c.id, label: c.id })),
                  ]}
                  value={f.state.value ?? ''}
                  onValueChange={(value) => f.handleChange(value || null)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={m["common.none"]()} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="">{m["common.none"]()}</SelectItem>
                      {custodyRecords.map((c: CustodyRecord) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.id}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.AppField>

          <form.AppField name="caseId">
            {(f) => (
              <Field>
                <FieldLabel>{m["bonds.related_case"]()}</FieldLabel>
                <Select
                  items={[{ value: '', label: m["common.none"]() }, ...cases.map((c: Case) => ({ value: c.id, label: c.reference }))]}
                  value={f.state.value ?? ''}
                  onValueChange={(value) => f.handleChange(value || null)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={m["common.none"]()} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="">{m["common.none"]()}</SelectItem>
                      {cases.map((c: Case) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.reference}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.AppField>
        </div>

        <form.AppField name="notes">
          {(f) => (
            <Field>
              <FieldLabel>{m["common.notes_optional"]()}</FieldLabel>
              <Textarea value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} rows={3} />
            </Field>
          )}
        </form.AppField>

        <AttachmentsField entityType={entityTypes.bond} entityId={bond?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={bond ? m["common.save_changes"]() : m["bonds.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
