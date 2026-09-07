import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"
import { Button } from "@pleadli/ui/button"
import { useFormContext } from "../contexts"

export function Submit({ label }: { label: string }) {
  const form = useFormContext()

  return (
    <form.Subscribe
      selector={(state) => [
        state.isSubmitting,
        state.canSubmit,
        state.isDirty,
        state.isTouched,
      ]}
    >
      {([isSubmitting, canSubmit, isDirty, isTouched]) => {
        const isDisabled = isSubmitting || !canSubmit || !isDirty || !isTouched
        return (
          <Button type="submit" disabled={isDisabled}>
            {isSubmitting && <HugeiconsIcon icon={Loading03Icon} className="animate-spin" />}
            {label}
          </Button>
        )
      }}
    </form.Subscribe>
  )
}