import * as m from '@/paraglide/messages'
import { useNextRegisterNumber } from '@/features/registers'
import { PersonPicker } from '@/components/person-picker'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { incidentsOptions, type Incident } from '@/features/incidents'
import { peopleSearchOptions, personFullName } from '@/features/people'
import { AddCircleIcon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Button } from '@pleadli/ui/button'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useStore } from '@tanstack/react-form'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useCasePeople, useCreateCase, useUpdateCase } from './queries'
import { caseRoleLabel, caseRoles, caseStatuses, casePersonName, type Case, type CasePerson } from './schema'

export type CaseFormProps = {
  case?: Case
  onSuccess?: (created: Case) => void
  onDirtyChange?: (dirty: boolean) => void
}

type PersonRoleRow = { personId: string; personName: string; role: string }

export function CaseForm({ case: existingCase, onSuccess, onDirtyChange }: CaseFormProps) {
  const createCase = useCreateCase()
  const updateCase = useUpdateCase()
  const { data: incidents } = useSuspenseQuery(incidentsOptions(''))
  const { data: existingPeople } = useCasePeople(existingCase?.id ?? '')
  const { data: knownPeople } = useQuery(peopleSearchOptions(''))

  const [people, setPeople] = useState<PersonRoleRow[]>(() =>
    (existingPeople ?? []).map((p: CasePerson) => ({
      personId: p.personId,
      personName: casePersonName(p),
      role: p.role,
    })),
  )
  // The people-role list lives outside `form`'s own fields, so its own
  // edits (adding/removing someone) wouldn't otherwise register as unsaved
  // work — tracked separately and combined with the form's real isDirty
  // below, rather than pretending the shared per-field tracker covers it.
  const [peopleDirty, setPeopleDirty] = useState(false)
  const [newPersonId, setNewPersonId] = useState<string | null>(null)
  const [newRole, setNewRole] = useState<string>(caseRoles[0].value)

  const { data: nextNumber } = useNextRegisterNumber('crb')

  const form = useAppForm({
    defaultValues: {
      reference: existingCase?.reference ?? '',
      summary: existingCase?.summary ?? '',
      status: existingCase?.status ?? 'open',
      incidentId: existingCase?.incidentId ?? (null as string | null),
    },
    validators: {
      onSubmit: ({ value }) => {
        if (existingCase && !value.reference.trim()) return m["validation.reference_required"]()
        if (!value.summary.trim()) return m["validation.summary_is_required"]()
        return undefined
      },
    },
    onSubmit: async ({ value }) => {
      try {
        const input = {
          ...value,
          people: people.map(({ personId, role }) => ({ personId, role })),
        }
        const result = existingCase
          ? await updateCase.mutateAsync({ id: existingCase.id, input })
          : await createCase.mutateAsync(input)
        t.success(existingCase ? m["cases.updated"]() : m["cases.opened"]())
        onSuccess?.(result)
      } catch {
        t.error(existingCase ? m["cases.update_failed"]() : m["cases.open_failed"](), {
          description: m["common.try_again"](),
        })
      }
    },
  })

  const isDirty = useStore(form.store, (state) => state.isDirty)
  useEffect(() => {
    onDirtyChange?.(isDirty || peopleDirty)
  }, [isDirty, peopleDirty, onDirtyChange])

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="reference">
            {(f) => (
              <f.input
                label={m["common.reference"]()}
                placeholder={existingCase ? m["cases.reference_example"]() : (nextNumber?.reference ?? m["common.numbered_when_saved"]())}
              />
            )}
          </form.AppField>
          <form.AppField name="status">
            {(f) => <f.select label={m["common.status"]()} options={[...caseStatuses]} />}
          </form.AppField>
        </div>

        {!existingCase && <FieldDescription>{m["cases.reference_hint"]()}</FieldDescription>}

        <form.AppField name="summary">{(f) => <f.textarea label={m["common.summary"]()} />}</form.AppField>

        <form.AppField name="incidentId">
          {(f) => (
            <Field>
              <FieldLabel>{m["cases.related_incident"]()}</FieldLabel>
              <Select
                items={[{ value: '', label: m["common.none"]() }, ...incidents.map((i: Incident) => ({ value: i.id, label: i.summary }))]}
                value={f.state.value ?? ''}
                onValueChange={(value) => f.handleChange(value || null)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m["common.none"]()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="">{m["common.none"]()}</SelectItem>
                    {incidents.map((incident: Incident) => (
                      <SelectItem key={incident.id} value={incident.id}>
                        {incident.summary}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.AppField>

        <Field>
          <FieldLabel>{m["cases.people_involved"]()}</FieldLabel>
          <div className="flex flex-col gap-2">
            {people.map((person, index) => (
              <div
                key={`${person.personId}-${person.role}`}
                className="flex items-center justify-between gap-2 rounded-sm border border-input/40 px-2 py-1.5"
              >
                <span className="text-xs">
                  {person.personName} · {caseRoleLabel(person.role)}
                </span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={m["common.remove"]()}
                  onClick={() => {
                    setPeople((prev) => prev.filter((_, i) => i !== index))
                    setPeopleDirty(true)
                  }}
                >
                  <HugeiconsIcon icon={Cancel01Icon} />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <PersonPicker value={newPersonId} onValueChange={setNewPersonId} placeholder={m["common.find_person"]()} />
            <Select items={[...caseRoles]} value={newRole} onValueChange={(value) => value && setNewRole(value)}>
              <SelectTrigger size="sm" className="min-w-28">
                <SelectValue placeholder={m["common.role"]()} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {caseRoles.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              aria-label={m["cases.add_person"]()}
              disabled={!newPersonId}
              onClick={() => {
                if (!newPersonId) return
                const person = knownPeople?.find((p) => p.id === newPersonId)
                const personName = person ? personFullName(person) : newPersonId
                setPeople((prev) => [...prev, { personId: newPersonId, personName, role: newRole }])
                setPeopleDirty(true)
                setNewPersonId(null)
              }}
            >
              <HugeiconsIcon icon={AddCircleIcon} />
            </Button>
          </div>
        </Field>

        <AttachmentsField entityType={entityTypes.case} entityId={existingCase?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={existingCase ? m["common.save_changes"]() : m["cases.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
