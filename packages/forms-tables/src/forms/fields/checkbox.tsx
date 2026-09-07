import { Field, FieldLabel, FieldDescription } from "@pleadli/ui/field"
import { Checkbox } from "@pleadli/ui/checkbox"
import { useFieldContext } from "../contexts"

export function FieldCheckbox({
  label,
  description,
  disabled,
}: {
  label: string
  description?: string
  disabled?: boolean
}) {
  const field = useFieldContext<boolean>()

  return (
    <Field orientation="horizontal">
      <Checkbox
        id={field.name}
        name={field.name}
        aria-label={label}
        checked={field.state.value}
        onCheckedChange={field.handleChange}
        disabled={disabled}
      />
      <div className="flex flex-col gap-0.5">
        <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </div>
    </Field>
  )
}