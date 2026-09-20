import { useReportDirty } from '@/hooks/use-report-dirty'
import { prisonerFullName, usePrisoners } from '@/features/prisoners'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useCreateRequest } from './queries'
import { createRequestSchema, requestCategories, type PrisonRequest } from './schema'
import { m } from '@/paraglide/messages'

export type RequestFormProps = {
  /** When set, the prisoner is fixed (embedded in that prisoner's workspace).
   * When omitted, a prisoner picker is shown, since a complaint may be
   * committee-sourced/anonymous rather than individually attributed. */
  prisonerId?: string
  onSuccess?: (request: PrisonRequest) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const UNLINKED = '__unlinked__'

/**
 * Logs a complaint via the Human Rights Committee / "Mukutano" mechanism
 * (docs/prisons/RESEARCH.md §11.6) — a plain log, not a structured
 * multi-stage case-management system.
 */
export function RequestForm({ prisonerId, onSuccess, onDirtyChange }: RequestFormProps) {
  const createRequest = useCreateRequest()
  const { data: prisoners } = usePrisoners('')

  const form = useAppForm({
    defaultValues: {
      prisonerId: prisonerId ?? UNLINKED,
      category: '',
      description: '',
      raisedAt: toDatetimeLocal(Date.now()),
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createRequestSchema.safeParse({
          ...value,
          prisonerId: value.prisonerId === UNLINKED ? null : value.prisonerId,
          raisedAt: new Date(value.raisedAt).getTime(),
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = {
          ...value,
          prisonerId: value.prisonerId === UNLINKED ? null : value.prisonerId,
          raisedAt: new Date(value.raisedAt).getTime(),
        }
        const result = await createRequest.mutateAsync(input)
        t.success(m.requests_complaint_recorded())
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(m.requests_could_not_record_complaint(), { description: m.requests_please_try_again() })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="panel-body"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      {!prisonerId && (
        <form.AppField name="prisonerId">
          {(f) => (
            <Field>
              <FieldLabel>{m.requests_prisoner_optional()}</FieldLabel>
              <Select
                items={[{ value: UNLINKED, label: m.requests_not_linked_to_a_specific_prisoner() }, ...prisoners.map((p) => ({ value: p.id, label: prisonerFullName(p) }))]}
                value={f.state.value}
                onValueChange={(value) => f.handleChange(value ?? f.state.value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.requests_select_prisoner()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={UNLINKED}>{m.requests_not_linked_to_a_specific_prisoner()}</SelectItem>
                    {prisoners.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {prisonerFullName(p)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.AppField>
      )}

      <form.AppField name="category">
        {(f) => (
          <Field>
            <FieldLabel>{m.requests_category()}</FieldLabel>
            <Select items={requestCategories} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={m.requests_select_category()} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {requestCategories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </form.AppField>

      <form.AppField name="description">{(f) => <f.input label={m.requests_description()} placeholder={m.requests_what_was_raised()} />}</form.AppField>

      <form.AppField name="raisedAt">
        {(f) => (
          <Field>
            <FieldLabel>{m.requests_raised_at()}</FieldLabel>
            <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m.requests_record_complaint()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
