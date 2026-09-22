import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import type { ReactNode } from 'react'

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  description?: ReactNode
  min?: string
}

/** A date and a time, in the machine's own zone. */
export function DateTimeField({ label, value, onChange, description, min }: Props) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input type="datetime-local" value={value} min={min} onChange={(e) => onChange(e.target.value)} />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

/** A date with no time. */
export function DateField({ label, value, onChange, description }: Props) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

/** A `datetime-local` value as a moment, or null when empty or not a date. */
export function momentOf(value: string): number | null {
  if (!value) return null
  const at = new Date(value).getTime()
  return Number.isNaN(at) ? null : at
}
