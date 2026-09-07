import { InputGroup, InputGroupAddon, InputGroupText, InputGroupTextarea } from "@pleadli/ui/input-group"
import type { ReactNode } from "react"
import { useFieldContext } from "../contexts"
import { FieldWrapper } from "./wrapper"

type FieldTextareaProps = {
  label: string
  icon?: ReactNode
} & Omit<
  React.ComponentProps<typeof InputGroupTextarea>,
  "id" | "name" | "value" | "onChange" | "onBlur"
>

export function FieldTextarea({ label, icon, ...props }: FieldTextareaProps) {
  const field = useFieldContext<string>()
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

  return (
    <FieldWrapper
      name={field.name}
      label={label}
      isInvalid={isInvalid}
      errors={field.state.meta.errors}
    >
      <InputGroup>
        {icon && (
          <InputGroupAddon align="block-start">
            <InputGroupText>{icon}</InputGroupText>
          </InputGroupAddon>
        )}
        <InputGroupTextarea
          id={field.name}
          name={field.name}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          aria-invalid={isInvalid}
          {...props}
        />
      </InputGroup>
    </FieldWrapper>
  )
}