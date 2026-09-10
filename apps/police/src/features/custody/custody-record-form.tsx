import { PersonPicker } from '@/components/person-picker'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { casesOptions, type Case } from '@/features/cases'
import { incidentsOptions, type Incident } from '@/features/incidents'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Switch } from '@pleadli/ui/switch'
import { Textarea } from '@pleadli/ui/textarea'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useCreateCustodyRecord, useUpdateCustodyRecord } from './queries'
import { custodyCompliance, custodyStatuses, createCustodyRecordSchema, type CustodyRecord } from './schema'

export type CustodyRecordFormProps = {
  record?: CustodyRecord
  onSuccess?: (record: CustodyRecord) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function CustodyRecordForm({ record, onSuccess, onDirtyChange }: CustodyRecordFormProps) {
  const createRecord = useCreateCustodyRecord()
  const updateRecord = useUpdateCustodyRecord()
  const { data: cases } = useSuspenseQuery(casesOptions(''))
  const { data: incidents } = useSuspenseQuery(incidentsOptions(''))

  const form = useAppForm({
    defaultValues: {
      personId: record?.personId ?? '',
      incidentId: record?.incidentId ?? (null as string | null),
      caseId: record?.caseId ?? (null as string | null),
      arrestedAt: record ? toDatetimeLocal(record.arrestedAt) : toDatetimeLocal(Date.now()),
      location: record?.location ?? '',
      crossJurisdictionTransfer: record?.crossJurisdictionTransfer ?? false,
      transferredAt: record?.transferredAt ? toDatetimeLocal(record.transferredAt) : '',
      status: record?.status ?? 'in_custody',
      releasedAt: record?.releasedAt ? toDatetimeLocal(record.releasedAt) : '',
      notes: record?.notes ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createCustodyRecordSchema.safeParse({
          ...value,
          arrestedAt: new Date(value.arrestedAt).getTime(),
          transferredAt: value.transferredAt ? new Date(value.transferredAt).getTime() : null,
          releasedAt: value.releasedAt ? new Date(value.releasedAt).getTime() : null,
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = {
          ...value,
          arrestedAt: new Date(value.arrestedAt).getTime(),
          transferredAt: value.transferredAt ? new Date(value.transferredAt).getTime() : null,
          releasedAt: value.releasedAt ? new Date(value.releasedAt).getTime() : null,
        }
        const result = record
          ? await updateRecord.mutateAsync({ id: record.id, input })
          : await createRecord.mutateAsync(input)
        t.success(record ? 'Custody record updated' : 'Custody record created')
        if (!record) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(record ? 'Could not update custody record' : 'Could not create custody record', {
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
        <form.AppField name="personId">
          {(f) => (
            <Field>
              <FieldLabel>Person in custody</FieldLabel>
              <PersonPicker value={f.state.value || null} onValueChange={(id) => f.handleChange(id ?? '')} />
            </Field>
          )}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="arrestedAt">
            {(f) => (
              <Field>
                <FieldLabel>Arrested at</FieldLabel>
                <Input
                  type="datetime-local"
                  value={f.state.value}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
              </Field>
            )}
          </form.AppField>
          <form.AppField name="location">
            {(f) => <f.input label="Lock-up / location" placeholder="e.g. Central Police Station cells" />}
          </form.AppField>
        </div>

        <form.Subscribe selector={(state) => [state.values.arrestedAt, state.values.crossJurisdictionTransfer, state.values.transferredAt] as const}>
          {([arrestedAt, crossJurisdictionTransfer, transferredAt]) => {
            if (!arrestedAt) return null
            const compliance = custodyCompliance({
              arrestedAt: new Date(arrestedAt).getTime(),
              crossJurisdictionTransfer,
              transferredAt: transferredAt ? new Date(transferredAt).getTime() : null,
            })
            const hours = Math.abs(compliance.hoursRemaining).toFixed(1)
            return (
              <Field>
                <div className="flex items-center gap-2">
                  <Badge variant={compliance.isOverdue ? 'destructive' : compliance.hoursRemaining < 6 ? 'default' : 'secondary'}>
                    {compliance.isOverdue ? `${hours}h overdue` : `${hours}h remaining`}
                  </Badge>
                  <FieldDescription>
                    Deadline: {new Date(compliance.deadline).toLocaleString()} ({compliance.basis})
                  </FieldDescription>
                </div>
              </Field>
            )
          }}
        </form.Subscribe>

        <form.AppField name="crossJurisdictionTransfer">
          {(f) => (
            <Field orientation="horizontal">
              <Switch checked={f.state.value} onCheckedChange={f.handleChange} />
              <FieldLabel>Cross-jurisdiction transfer (arrested outside the station's area)</FieldLabel>
            </Field>
          )}
        </form.AppField>

        <form.Subscribe selector={(state) => state.values.crossJurisdictionTransfer}>
          {(crossJurisdictionTransfer) =>
            crossJurisdictionTransfer && (
              <form.AppField name="transferredAt">
                {(f) => (
                  <Field>
                    <FieldLabel>Transferred to this station at</FieldLabel>
                    <Input
                      type="datetime-local"
                      value={f.state.value}
                      onChange={(e) => f.handleChange(e.target.value)}
                    />
                    <FieldDescription>
                      The Police Act allows up to 7 days to transfer a suspect arrested outside the station's
                      jurisdiction; the 48-hour clock applies once here.
                    </FieldDescription>
                  </Field>
                )}
              </form.AppField>
            )
          }
        </form.Subscribe>

        <form.AppField name="status">
          {(f) => (
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select
                items={custodyStatuses}
                value={f.state.value}
                onValueChange={(value) => f.handleChange(value ?? f.state.value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {custodyStatuses.map((s) => (
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

        <form.Subscribe selector={(state) => state.values.status}>
          {(status) =>
            status !== 'in_custody' && (
              <form.AppField name="releasedAt">
                {(f) => (
                  <Field>
                    <FieldLabel>Resolved at</FieldLabel>
                    <Input
                      type="datetime-local"
                      value={f.state.value}
                      onChange={(e) => f.handleChange(e.target.value)}
                    />
                  </Field>
                )}
              </form.AppField>
            )
          }
        </form.Subscribe>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="incidentId">
            {(f) => (
              <Field>
                <FieldLabel>Related incident (optional)</FieldLabel>
                <Select
                  items={[{ value: '', label: 'None' }, ...incidents.map((i: Incident) => ({ value: i.id, label: i.summary }))]}
                  value={f.state.value ?? ''}
                  onValueChange={(value) => f.handleChange(value || null)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="">None</SelectItem>
                      {incidents.map((i: Incident) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.summary}
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
                <FieldLabel>Related case (optional)</FieldLabel>
                <Select
                  items={[{ value: '', label: 'None' }, ...cases.map((c: Case) => ({ value: c.id, label: c.reference }))]}
                  value={f.state.value ?? ''}
                  onValueChange={(value) => f.handleChange(value || null)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="">None</SelectItem>
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
              <FieldLabel>Notes (optional)</FieldLabel>
              <Textarea value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} rows={3} />
            </Field>
          )}
        </form.AppField>

        <AttachmentsField entityType={entityTypes.custodyRecord} entityId={record?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={record ? 'Save changes' : 'Create custody record'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
