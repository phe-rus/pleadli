import { Field, FieldError, FieldLabel } from "@pleadli/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pleadli/ui/select";
import { useFieldContext } from "../contexts";

export type SelectOption = {
  label: string;
  value: string
}

export function FieldSelect({
  label,
  options,
  placeholder = "Select…",
  disabled,
}: {
  label: string
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
}) {
  const field = useFieldContext<string>()
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value ?? "")}
        disabled={disabled}
      >
        <SelectTrigger
          id={field.name}
          name={field.name}
          aria-invalid={isInvalid}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isInvalid && <FieldError errors={field.state.meta.errors} />}
    </Field>
  )
}