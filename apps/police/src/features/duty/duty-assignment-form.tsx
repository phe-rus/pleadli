import { AttachmentsField, entityTypes } from '@/features/attachments'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { createDutyAssignmentSchema, type DutyAssignment } from './schema'
import { useCreateDutyAssignment, useUpdateDutyAssignment } from './queries'

export type DutyAssignmentFormProps = {
  assignment?: DutyAssignment
  onSuccess?: (assignment: DutyAssignment) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function DutyAssignmentForm({ assignment, onSuccess }: DutyAssignmentFormProps) {
  const createAssignment = useCreateDutyAssignment()
  const updateAssignment = useUpdateDutyAssignment()

  const form = useAppForm({
    defaultValues: {
      officerName: assignment?.officerName ?? '',
      officerRank: assignment?.officerRank ?? '',
      unit: assignment?.unit ?? '',
      shiftStart: assignment ? toDatetimeLocal(assignment.shiftStart) : toDatetimeLocal(Date.now()),
      shiftEnd: assignment ? toDatetimeLocal(assignment.shiftEnd) : toDatetimeLocal(Date.now() + 8 * 60 * 60 * 1000),
      notes: assignment?.notes ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createDutyAssignmentSchema.safeParse({
          ...value,
          shiftStart: new Date(value.shiftStart).getTime(),
          shiftEnd: new Date(value.shiftEnd).getTime(),
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = {
          ...value,
          shiftStart: new Date(value.shiftStart).getTime(),
          shiftEnd: new Date(value.shiftEnd).getTime(),
        }
        const result = assignment
          ? await updateAssignment.mutateAsync({ id: assignment.id, input })
          : await createAssignment.mutateAsync(input)
        t.success(assignment ? 'Assignment updated' : 'Assignment added')
        if (!assignment) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(assignment ? 'Could not update assignment' : 'Could not add assignment', {
          description: 'Please try again.',
        })
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
        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="officerName">
            {(f) => <f.input label="Officer name" />}
          </form.AppField>
          <form.AppField name="officerRank">
            {(f) => <f.input label="Rank" />}
          </form.AppField>
        </div>

        <form.AppField name="unit">{(f) => <f.input label="Unit" />}</form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="shiftStart">
            {(f) => (
              <Field>
                <FieldLabel>Shift start</FieldLabel>
                <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
              </Field>
            )}
          </form.AppField>
          <form.AppField name="shiftEnd">
            {(f) => (
              <Field>
                <FieldLabel>Shift end</FieldLabel>
                <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
              </Field>
            )}
          </form.AppField>
        </div>

        <form.AppField name="notes">{(f) => <f.textarea label="Notes" />}</form.AppField>

        <AttachmentsField entityType={entityTypes.dutyAssignment} entityId={assignment?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={assignment ? 'Save changes' : 'Add assignment'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
