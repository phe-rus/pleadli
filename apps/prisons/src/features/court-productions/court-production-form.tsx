import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useCreateCourtProduction } from './queries'
import { createCourtProductionSchema, productionMethods, type CourtProduction } from './schema'

export type CourtProductionFormProps = {
  prisonerId: string
  onSuccess?: (production: CourtProduction) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Records a court production (s.67) — reactive, court-initiated. Also
 * supplies s.118's "date last appeared in court" as a derived value (the
 * latest production date), see docs/prisons/PRODUCT.md §Custody & Remand
 * tracking.
 */
export function CourtProductionForm({ prisonerId, onSuccess, onDirtyChange }: CourtProductionFormProps) {
  const createProduction = useCreateCourtProduction()

  const form = useAppForm({
    defaultValues: {
      courtReference: '',
      productionDate: toDatetimeLocal(Date.now()),
      purpose: '',
      productionMethod: 'physical',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createCourtProductionSchema.safeParse({
          ...value,
          prisonerId,
          productionDate: new Date(value.productionDate).getTime(),
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, prisonerId, productionDate: new Date(value.productionDate).getTime() }
        const result = await createProduction.mutateAsync(input)
        t.success('Court production recorded')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not record court production', { description: 'Please try again.' })
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
      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="courtReference">{(f) => <f.input label="Court reference (optional)" />}</form.AppField>
        <form.AppField name="productionDate">
          {(f) => (
            <Field>
              <FieldLabel>Production date</FieldLabel>
              <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
      </div>

      <form.AppField name="productionMethod">
        {(f) => (
          <Field>
            <FieldLabel>Production method</FieldLabel>
            <Select items={productionMethods} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {productionMethods.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </form.AppField>

      <form.AppField name="purpose">
        {(f) => (
          <Field>
            <FieldLabel>Purpose (optional)</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="e.g. Mention, plea, sentencing…" />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Record production" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
