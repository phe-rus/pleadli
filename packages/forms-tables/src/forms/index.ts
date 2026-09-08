import { createFormHook } from "@tanstack/react-form"
import { fieldContext, formContext } from "./contexts"
import { Submit } from "./elements/submit"
import { fields } from "./fields"

export const {
  useAppForm,
  withForm
} = createFormHook({
  fieldComponents: {
    ...fields,
  },
  formComponents: {
    submit: Submit,
  },
  fieldContext,
  formContext,
})