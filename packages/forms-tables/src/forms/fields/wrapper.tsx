import { Field, FieldError, FieldLabel } from "@pleadli/ui/field"
import type { ReactNode } from "react"

export function FieldWrapper({
  name,
  label,
  isInvalid,
  errors,
  children,
}: {
  name: string
  label: string
  isInvalid: boolean
  errors: Array<{ message?: string } | undefined>
  children: ReactNode
}) {
  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      {children}
      {isInvalid && <FieldError errors={errors} />}
    </Field>
  )
}