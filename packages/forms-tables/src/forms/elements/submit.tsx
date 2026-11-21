import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"
import { Button } from "@pleadli/ui/button"
import { useFormContext } from "../contexts"

/** The form's save button. When the form's own check refuses to save (for example a date that is
 * needed), the reason is shown under the button, so the person is never left with a button that
 * does nothing and no word as to why. */
/** `allowPristine`: a new record that starts filled in (for example a case opened from an incident) can be saved as it is. */
export function Submit({ label, disabled = false, allowPristine = false }: { label: string; disabled?: boolean; allowPristine?: boolean }) {
  const form = useFormContext()

  return (
    <form.Subscribe
      selector={(state) => ({
        isSubmitting: state.isSubmitting,
        canSubmit: state.canSubmit,
        isDirty: state.isDirty,
        isTouched: state.isTouched,
        // Form-level errors from the submit check are plain strings.
        reasons: state.errors.flatMap((error) => (typeof error === "string" && error ? [error] : [])),
      })}
    >
      {({ isSubmitting, canSubmit, isDirty, isTouched, reasons }) => {
        const isDisabled = disabled || isSubmitting || !canSubmit || (!allowPristine && (!isDirty || !isTouched))
        return (
          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={isDisabled}>
              {isSubmitting && <HugeiconsIcon icon={Loading03Icon} className="animate-spin" />}
              {label}
            </Button>
            {reasons.length > 0 && (
              <p role="alert" className="text-[0.8125rem] text-destructive">
                {reasons[0]}
              </p>
            )}
          </div>
        )
      }}
    </form.Subscribe>
  )
}
