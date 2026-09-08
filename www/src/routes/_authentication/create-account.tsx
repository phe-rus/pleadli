import { authClient } from '@/auth/client'
import { Button } from '@pleadli/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link } from '@tanstack/react-router'
import { t } from '@pleadli/ui/goey-toaster'
import * as z from 'zod'

export const Route = createFileRoute('/_authentication/create-account')({
  component: RouteComponent,
})

function RouteComponent() {
  const createAccountSchema = z.object({
    name: z.string().min(1, 'Name is required.'),
    email: z.email('Enter a valid email address.'),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
  })

  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    validators: { onChange: createAccountSchema },
    onSubmit: async ({ value }) => {
      const { data, error } = await authClient.signUp.email(value)
      if (error) {
        t.error('Could not create account', {
          description: error.message ?? undefined
        })
        return
      }
      const role = (data.user as { role?: string }).role
      window.location.href = role === 'admin' ? '/admin' : '/'
    },
  })

  return (
    <article className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center">
      <h1 className="mb-1 text-2xl font-semibold">Create account</h1>
      <p className="mb-6 text-sm text-muted-foreground">Pleadli Cloud administration.</p>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field name="name">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
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

          <form.Field name="email">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  id={field.name}
                  type="email"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                <Input
                  id={field.name}
                  type="password"
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
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Creating account...' : 'Create account'}
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-foreground">
          Sign in
        </Link>
      </p>
    </article>
  )
}
