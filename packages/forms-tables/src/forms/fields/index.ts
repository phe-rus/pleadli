import { FieldInput } from "./input"
import { FieldTextarea } from "./textarea"
import { FieldCheckbox } from "./checkbox"
import { FieldSelect } from "./select"
import { FieldMultiselect } from "./multiselect"

export const fields = {
  input: FieldInput,
  textarea: FieldTextarea,
  checkbox: FieldCheckbox,
  select: FieldSelect,
  multiselect: FieldMultiselect,
}

export * from "./input"
export * from "./textarea"
export * from "./checkbox"
export * from "./select"
export * from "./multiselect"
export * from "./wrapper"