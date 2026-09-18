import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useResolveRequest } from './queries'
import { resolveRequestSchema, type PrisonRequest } from './schema'

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
        t.success('Complaint resolved')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not record resolution', { description: 'Please try again.' })
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
      <form.AppField name="resolvedAt">
        {(f) => (
          <Field>
            <FieldLabel>Resolved at</FieldLabel>
            <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
          </Field>
        )}
      </form.AppField>

      <form.AppField name="outcomeNote">
        {(f) => (
          <Field>
            <FieldLabel>Outcome / further action (optional)</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="What was done…" />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Mark resolved" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
