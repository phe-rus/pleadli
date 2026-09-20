import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useResolveRequest } from './queries'
import { resolveRequestSchema, type PrisonRequest } from './schema'
import { m } from '@/paraglide/messages'

export type ResolveRequestFormProps = {
  request: PrisonRequest
  onSuccess?: (request: PrisonRequest) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Records "further action" on a complaint (docs/prisons/RESEARCH.md §11.6). */
export function ResolveRequestForm({ request, onSuccess, onDirtyChange }: ResolveRequestFormProps) {
  const resolve = useResolveRequest()

  const form = useAppForm({
    defaultValues: {
      resolvedAt: toDatetimeLocal(Date.now()),
      outcomeNote: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = resolveRequestSchema.safeParse({ ...value, resolvedAt: new Date(value.resolvedAt).getTime() })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, resolvedAt: new Date(value.resolvedAt).getTime() }
        const result = await resolve.mutateAsync({ id: request.id, input })
        t.success(m.requests_complaint_resolved())
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(m.requests_could_not_record_resolution(), { description: m.requests_please_try_again() })
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
      <form.AppField name="resolvedAt">
        {(f) => (
          <Field>
            <FieldLabel>{m.requests_resolved_at()}</FieldLabel>
            <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
          </Field>
        )}
      </form.AppField>

      <form.AppField name="outcomeNote">
        {(f) => (
          <Field>
            <FieldLabel>{m.requests_outcome_further_action_optional()}</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder={m.requests_what_was_done()} />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m.requests_mark_resolved()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
