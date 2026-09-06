import { createFileRoute } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { Form, TextField, Label, Input, FieldError, Button } from 'react-aria-components'
import { useState } from 'react'
import * as z from 'zod'
import { authClient } from '../../auth/client'

const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})

export const Route = createFileRoute('/_authentication/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: RouteComponent,
})

function RouteComponent() {
  const search = Route.useSearch()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onChange: loginSchema },
    onSubmit: async ({ value }) => {
      setFormError(null)
      const { error } = await authClient.signIn.email(value)
      if (error) {
        setFormError(error.message ?? 'Sign in failed.')
        return
      }
      window.location.href = search.redirect ?? '/admin'
    },
  })

  return (
    <article>
      <Form
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
        className="demo-panel w-full max-w-sm"
      >
        <h1 className="demo-title mb-1 text-2xl">Sign in</h1>
        <p className="demo-muted mb-6">Pleadli Cloud administration.</p>

        <form.Field name="email">
          {(field) => (
            <TextField
              className="mb-3 block"
              isInvalid={field.state.meta.errors.length > 0}
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            >
              <Label className="demo-section-title mb-1 block">Email</Label>
              <Input className="demo-input" type="email" />
              <FieldError className="demo-alert demo-alert-danger mt-1 block text-sm">
                {field.state.meta.errors.map((error) => error?.message).join(', ')}
              </FieldError>
            </TextField>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <TextField
              className="mb-4 block"
              isInvalid={field.state.meta.errors.length > 0}
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            >
              <Label className="demo-section-title mb-1 block">Password</Label>
              <Input className="demo-input" type="password" />
              <FieldError className="demo-alert demo-alert-danger mt-1 block text-sm">
                {field.state.meta.errors.map((error) => error?.message).join(', ')}
              </FieldError>
            </TextField>
          )}
        </form.Field>

        {formError && <p className="demo-alert demo-alert-danger mb-4">{formError}</p>}

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" isDisabled={isSubmitting} className="demo-button w-full">
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
          )}
        </form.Subscribe>
      </Form>
    </article>
  )
}
