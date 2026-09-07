import { createFormHook, useSelector, useStore } from "@tanstack/react-form"
import { fieldContext, formContext } from "./contexts"
import { Submit } from "./elements/submit"
import { fields } from "./fields"

export const { useAppForm, withForm } = createFormHook({
  fieldComponents: {
    ...fields,
  },
  formComponents: {
    submit: Submit,
  },
  fieldContext,
  formContext,
})

// for reading another field's live value from within a form — e.g. a
// select whose options depend on what's currently chosen elsewhere in the
// same form — without subscribing the whole component to every field
export { useSelector, useStore }

export * from "./contexts"
export * from "./fields"