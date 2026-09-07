import { createCase } from '@/db'
import { Button } from '@pleadli/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { Textarea } from '@pleadli/ui/textarea'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { toast } from 'gooey-toast'
import * as z from 'zod'

export const Route = createFileRoute('/intake')({
  component: RouteComponent,
})

function RouteComponent() {
  const router = useRouter()

  const intakeSchema = z.object({
    complainant: z.string().min(1, 'Complainant name is required.'),
    location: z.string().min(1, 'Location is required.'),
    description: z.string().min(1, 'Incident description is required.'),
  })

  const form = useForm({
    defaultValues: { complainant: '', location: '', description: '' },
    validators: { onChange: intakeSchema },
    onSubmit: async ({ value, formApi }) => {
      const id = await createCase(value)
      toast.success({ title: 'Case opened', description: id })
      formApi.reset()
      router.invalidate()
    },
  })

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Case intake</h1>
        <p className="text-sm text-muted-foreground">
          Open a new case. It's saved locally right away, and syncs to Pleadli Cloud once online.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field name="complainant">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor={field.name}>Complainant name</FieldLabel>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>

          <form.Field name="location">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor={field.name}>Location</FieldLabel>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor={field.name}>Incident description</FieldLabel>
                <Textarea
                  id={field.name}
                  rows={5}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting} className="w-fit">
                {isSubmitting ? 'Opening case...' : 'Open case'}
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>
    </div>
  )
}
