import { Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useStore, type AnyFormApi } from '@tanstack/react-form'
import { Button } from '@pleadli/ui/button'

/** A submit button for a form whose defaults are already a valid answer (a
 * sitting at the next morning's nine, an order made from what was recorded, a
 * cancellation with no reason given). The shared Submit waits for the person to
 * change something first, which is right for a blank form and wrong for these:
 * this one waits only while a save is running. */
export function SubmitButton({ form, label }: { form: AnyFormApi; label: string }) {
  const submitting = useStore(form.store, (state) => state.isSubmitting)
  return (
    <Button type="submit" disabled={submitting}>
      {submitting && <HugeiconsIcon icon={Loading03Icon} className="animate-spin" />}
      {label}
    </Button>
  )
}
