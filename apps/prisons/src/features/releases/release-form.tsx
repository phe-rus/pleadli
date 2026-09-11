import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useCreateRelease } from './queries'
import { createReleaseSchema, releaseTypes, type Release } from './schema'

export type ReleaseFormProps = {
  prisonerId: string
  onSuccess?: (release: Release) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Records a real release trigger as an auditable event
 * (docs/prisons/PRODUCT.md §Release) — the substance of "release," not a
 * status dropdown.
 */
export function ReleaseForm({ prisonerId, onSuccess, onDirtyChange }: ReleaseFormProps) {
  const createRelease = useCreateRelease()

  const form = useAppForm({
    defaultValues: {
      releaseType: '',
      releasedAt: toDatetimeLocal(Date.now()),
      orderedBy: '',
      notes: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createReleaseSchema.safeParse({ ...value, prisonerId, releasedAt: new Date(value.releasedAt).getTime() })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, prisonerId, releasedAt: new Date(value.releasedAt).getTime() }
        const result = await createRelease.mutateAsync(input)
        t.success('Release recorded')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not record release', { description: 'Please try again.' })
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
      <form.AppField name="releaseType">
        {(f) => (
          <Field>
            <FieldLabel>Release type</FieldLabel>
            <Select items={releaseTypes} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select release type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {releaseTypes.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="orderedBy">{(f) => <f.input label="Ordered by (optional)" placeholder="Name / court" />}</form.AppField>
        <form.AppField name="releasedAt">
          {(f) => (
            <Field>
              <FieldLabel>Released at</FieldLabel>
              <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
      </div>

      <form.AppField name="notes">
        {(f) => (
          <Field>
            <FieldLabel>Notes (optional)</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="Notes…" />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Record release" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
