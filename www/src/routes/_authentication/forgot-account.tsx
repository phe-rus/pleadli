import { authClient } from '@/auth/client'
import { Button } from '@pleadli/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link } from '@tanstack/react-router'
import { toast } from 'gooey-toast'
import * as z from 'zod'

export const Route = createFileRoute('/_authentication/forgot-account')({
  component: RouteComponent,
})

function RouteComponent() {
  const forgotSchema = z.object({
    email: z.email('Enter a valid email address.'),
  })

  const form = useForm({
    defaultValues: { email: '' },
    validators: { onChange: forgotSchema },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.requestPasswordReset({
        email: value.email,
        redirectTo: '/',
      })
      if (error) {
        toast.error({ title: 'Could not send reset email', description: error.message ?? undefined })
        return
      }
      toast.success({ title: 'Check your email', description: 'We sent a password reset link.' })
    },
  })

  return (
    <article className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold">Reset password</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Enter your email and we'll send you a reset link.
      </p>

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

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Sending...' : 'Send reset link'}
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Remember your password?{' '}
        <Link to="/login" className="font-medium text-foreground">
          Sign in
        </Link>
      </p>
    </article>
  )
}
