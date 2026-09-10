import { PersonPicker } from '@/components/person-picker'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { createStationAssetSchema, stationAssetStatuses, type StationAsset } from './schema'
import { useCreateStationAsset, useUpdateStationAsset } from './queries'

export type StationAssetFormProps = {
  /** Fixed by the page this form is opened from (Armory Register vs.
   * Impounded Assets) — not user-editable, so an item can't silently
   * disappear from the list it was just added to. */
  category: string
  asset?: StationAsset
  onSuccess?: (asset: StationAsset) => void
}

export function StationAssetForm({ category, asset, onSuccess }: StationAssetFormProps) {
  const createAsset = useCreateStationAsset()
  const updateAsset = useUpdateStationAsset()

  const form = useAppForm({
    defaultValues: {
      category,
      description: asset?.description ?? '',
      itemIdentifier: asset?.itemIdentifier ?? '',
      status: asset?.status ?? 'in_store',
      holderName: asset?.holderName ?? '',
      personId: asset?.personId ?? (null as string | null),
      notes: asset?.notes ?? '',
    },
    validators: {
      onSubmit: createStationAssetSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = asset
          ? await updateAsset.mutateAsync({ id: asset.id, input: value })
          : await createAsset.mutateAsync(value)
        t.success(asset ? 'Item updated' : 'Item added')
        if (!asset) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(asset ? 'Could not update item' : 'Could not add item', { description: 'Please try again.' })
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
        <form.AppField name="description">{(f) => <f.input label="Description" />}</form.AppField>
        <form.AppField name="itemIdentifier">
          {(f) => <f.input label="Identifier" placeholder="Serial number, plate, etc." />}
        </form.AppField>
        <form.AppField name="status">
          {(f) => <f.select label="Status" options={[...stationAssetStatuses]} />}
        </form.AppField>
        <form.AppField name="holderName">
          {(f) => <f.input label="Held by" placeholder="Officer or unit currently holding it" />}
        </form.AppField>
        <form.AppField name="personId">
          {(f) => (
            <Field>
              <FieldLabel>Related person (optional)</FieldLabel>
              <PersonPicker value={f.state.value} onValueChange={f.handleChange} />
            </Field>
          )}
        </form.AppField>
        <form.AppField name="notes">{(f) => <f.textarea label="Notes" />}</form.AppField>

        <AttachmentsField entityType={entityTypes.stationAsset} entityId={asset?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={asset ? 'Save changes' : 'Add item'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
