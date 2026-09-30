import * as m from '@/paraglide/messages'
import { PersonPicker } from '@/components/person-picker'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { createVehicleSchema, type Vehicle } from './schema'
import { useCreateVehicle, useUpdateVehicle } from './queries'

export type VehicleFormProps = {
  vehicle?: Vehicle
  onSuccess?: (vehicle: Vehicle) => void
}

export function VehicleForm({ vehicle, onSuccess }: VehicleFormProps) {
  const createVehicle = useCreateVehicle()
  const updateVehicle = useUpdateVehicle()

  const form = useAppForm({
    defaultValues: {
      plateNumber: vehicle?.plateNumber ?? '',
      make: vehicle?.make ?? '',
      model: vehicle?.model ?? '',
      color: vehicle?.color ?? '',
      ownerPersonId: vehicle?.ownerPersonId ?? (null as string | null),
      notes: vehicle?.notes ?? '',
    },
    validators: {
      onSubmit: createVehicleSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = vehicle
          ? await updateVehicle.mutateAsync({ id: vehicle.id, input: value })
          : await createVehicle.mutateAsync(value)
        t.success(vehicle ? m["vehicles.updated"]() : m["vehicles.added"]())
        if (!vehicle) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(vehicle ? m["vehicles.update_failed"]() : m["vehicles.add_failed"](), { description: m["common.try_again"]() })
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
        <form.AppField name="plateNumber">{(f) => <f.input label={m["vehicles.plate"]()} />}</form.AppField>
        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="make">{(f) => <f.input label={m["vehicles.make"]()} />}</form.AppField>
          <form.AppField name="model">{(f) => <f.input label={m["vehicles.model"]()} />}</form.AppField>
        </div>
        <form.AppField name="color">{(f) => <f.input label={m["vehicles.color"]()} />}</form.AppField>
        <form.AppField name="ownerPersonId">
          {(f) => (
            <Field>
              <FieldLabel>{m["vehicles.owner"]()}</FieldLabel>
              <PersonPicker value={f.state.value} onValueChange={f.handleChange} />
            </Field>
          )}
        </form.AppField>
        <form.AppField name="notes">{(f) => <f.textarea label={m["common.notes"]()} />}</form.AppField>

        <AttachmentsField entityType={entityTypes.vehicle} entityId={vehicle?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={vehicle ? m["common.save_changes"]() : m["vehicles.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
