import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
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
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  description?: string
  autoFocus?: boolean
  autoComplete?: string
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input type={type} value={value} placeholder={placeholder} autoFocus={autoFocus} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
      {description && <FieldDescription>{description}</FieldDescription>}
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
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Textarea value={value} placeholder={placeholder} rows={3} onChange={(e) => onChange(e.target.value)} />
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
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select items={options} value={value} onValueChange={(next) => onChange(next ?? value)}>
        <SelectTrigger className="w-full">
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
