import { Field, FieldDescription, FieldError, FieldLabel } from '@pleadli/ui/field'
import { useId } from 'react'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Switch } from '@pleadli/ui/switch'
import { Textarea } from '@pleadli/ui/textarea'

type Option = { readonly value: string; readonly label: string }

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  description,
  autoFocus,
  autoComplete,
  error,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  description?: string
  autoFocus?: boolean
  autoComplete?: string
  /** Why the value is refused, shown under the field. */
  error?: string
  className?: string
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type={type} value={value} placeholder={placeholder} autoFocus={autoFocus} autoComplete={autoComplete} aria-invalid={error ? true : undefined} className={className} onChange={(e) => onChange(e.target.value)} />
      {error ? <FieldError>{error}</FieldError> : description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

export function AreaField({
  label,
  value,
  onChange,
  placeholder,
  description,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  description?: string
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea id={id} value={value} placeholder={placeholder} rows={3} onChange={(e) => onChange(e.target.value)} />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  description,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly Option[]
  placeholder: string
  description?: string
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select items={options} value={value} onValueChange={(next) => onChange(next ?? value)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

export function SwitchField({
  label,
  checked,
  onChange,
  description,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
}) {
  return (
    <Field orientation="horizontal" className="items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} />
      <div className="flex flex-col gap-0.5">
        <FieldLabel>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </div>
    </Field>
  )
}
