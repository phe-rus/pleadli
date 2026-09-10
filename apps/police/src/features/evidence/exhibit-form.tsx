import { PersonPicker } from '@/components/person-picker'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { casesOptions, type Case } from '@/features/cases'
import { incidentsOptions, type Incident } from '@/features/incidents'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Textarea } from '@pleadli/ui/textarea'
import { Button } from '@pleadli/ui/button'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { format } from 'date-fns/format'
import { useCreateExhibit, useCreateExhibitMovement, useExhibitMovements, useUpdateExhibit } from './queries'
import { exhibitStatuses, createExhibitSchema, type Exhibit } from './schema'

/** The chain-of-custody log — shown only in edit mode, once an exhibit
 * actually has an id to attach movements to. A plain list plus a minimal
 * inline "add movement" row, not a second drawer/form — each row is a real
 * event, never edited after the fact. */
function ExhibitMovements({ exhibitId }: { exhibitId: string }) {
  const { data: movements } = useExhibitMovements(exhibitId)
  const createMovement = useCreateExhibitMovement(exhibitId)
  const [location, setLocation] = useState('')
  const [custodianName, setCustodianName] = useState('')

  return (
    <Field>
      <FieldLabel>Chain of custody</FieldLabel>
      {(movements ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">No movements logged yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {movements?.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded-sm border border-input/40 px-2 py-1.5">
              <span className="text-xs">
                {m.location}
                {m.custodianName ? ` · ${m.custodianName}` : ''}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{format(m.movedAt, 'PP')}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input placeholder="New location" value={location} onChange={(e) => setLocation(e.target.value)} />
        <Input placeholder="Custodian" value={custodianName} onChange={(e) => setCustodianName(e.target.value)} />
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          aria-label="Log movement"
          disabled={!location.trim() || createMovement.isPending}
          onClick={() => {
            createMovement.mutate(
              { movedAt: Date.now(), location: location.trim(), custodianName: custodianName.trim(), reason: '' },
              { onSuccess: () => { setLocation(''); setCustodianName('') } },
            )
          }}
        >
          <HugeiconsIcon icon={AddCircleIcon} />
        </Button>
      </div>
    </Field>
  )
}

export type ExhibitFormProps = {
  exhibit?: Exhibit
  onSuccess?: (exhibit: Exhibit) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ExhibitForm({ exhibit, onSuccess, onDirtyChange }: ExhibitFormProps) {
  const createExhibit = useCreateExhibit()
  const updateExhibit = useUpdateExhibit()
  const { data: cases } = useSuspenseQuery(casesOptions(''))
  const { data: incidents } = useSuspenseQuery(incidentsOptions(''))

  const form = useAppForm({
    defaultValues: {
      caseId: exhibit?.caseId ?? (null as string | null),
      incidentId: exhibit?.incidentId ?? (null as string | null),
      personId: exhibit?.personId ?? (null as string | null),
      description: exhibit?.description ?? '',
      identificationMark: exhibit?.identificationMark ?? '',
      recoveredAt: exhibit ? toDatetimeLocal(exhibit.recoveredAt) : toDatetimeLocal(Date.now()),
      recoveredFromLocation: exhibit?.recoveredFromLocation ?? '',
      handedOverBy: exhibit?.handedOverBy ?? '',
      witnesses: exhibit?.witnesses ?? '',
      receivingOfficerName: exhibit?.receivingOfficerName ?? '',
      storageLocation: exhibit?.storageLocation ?? '',
      status: exhibit?.status ?? 'in_storage',
      notes: exhibit?.notes ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createExhibitSchema.safeParse({
          ...value,
          recoveredAt: new Date(value.recoveredAt).getTime(),
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, recoveredAt: new Date(value.recoveredAt).getTime() }
        const result = exhibit
          ? await updateExhibit.mutateAsync({ id: exhibit.id, input })
          : await createExhibit.mutateAsync(input)
        t.success(exhibit ? 'Exhibit updated' : 'Exhibit logged')
        if (!exhibit) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(exhibit ? 'Could not update exhibit' : 'Could not log exhibit', {
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
        <form.AppField name="description">
          {(f) => <f.textarea label="Description" placeholder="Nature of the exhibit" />}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="identificationMark">
            {(f) => <f.input label="Identification mark" placeholder="Mark placed on the exhibit" />}
          </form.AppField>
          <form.AppField name="recoveredAt">
            {(f) => (
              <Field>
                <FieldLabel>Recovered at</FieldLabel>
                <Input
                  type="datetime-local"
                  value={f.state.value}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
              </Field>
            )}
          </form.AppField>
        </div>

        <form.AppField name="recoveredFromLocation">
          {(f) => <f.input label="Recovered from" placeholder="Place of recovery" />}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="handedOverBy">
            {(f) => <f.input label="Handed over by" />}
          </form.AppField>
          <form.AppField name="witnesses">
            {(f) => <f.input label="Witnesses present" />}
          </form.AppField>
        </div>

        <form.AppField name="personId">
          {(f) => (
            <Field>
              <FieldLabel>Related person (optional)</FieldLabel>
              <PersonPicker value={f.state.value} onValueChange={f.handleChange} />
            </Field>
          )}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="receivingOfficerName">
            {(f) => <f.input label="Receiving officer" />}
          </form.AppField>
          <form.AppField name="storageLocation">
            {(f) => <f.input label="Storage location" />}
          </form.AppField>
        </div>

        <form.AppField name="status">
          {(f) => (
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select
                items={exhibitStatuses}
                value={f.state.value}
                onValueChange={(value) => f.handleChange(value ?? f.state.value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {exhibitStatuses.map((s) => (
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

        {exhibit && <ExhibitMovements exhibitId={exhibit.id} />}

        <AttachmentsField entityType={entityTypes.exhibit} entityId={exhibit?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={exhibit ? 'Save changes' : 'Log exhibit'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
