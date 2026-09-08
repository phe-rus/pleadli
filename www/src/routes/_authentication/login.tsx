import { authClient } from '@/auth/client'
import { Button } from '@pleadli/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link } from '@tanstack/react-router'
import * as z from 'zod'

export const Route = createFileRoute('/_authentication/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  component: RouteComponent,
})

function RouteComponent() {
  const search = Route.useSearch()

  const loginSchema = z.object({
    email: z.email('Enter a valid email address.'),
    password: z.string().min(1, 'Password is required.'),
  })

  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onChange: loginSchema },
    onSubmit: async ({ value }) => {
      const { data, error } = await authClient.signIn.email(value)
      if (error) {
        t.error('Sign in failed', {
          description: error.message ?? undefined
        })
        return
      }
      const role = (data.user as { role?: string }).role
      window.location.href = search.redirect ?? (role === 'admin' ? '/admin' : '/')
    },
  })

  return (
    <article className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-muted-foreground">Pleadli Cloud administration.</p>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
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
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Don't have an account?{' '}
        <Link to="/create-account" className="font-medium text-foreground">
          Create one
        </Link>
      </p>
    </article>
  )
}
