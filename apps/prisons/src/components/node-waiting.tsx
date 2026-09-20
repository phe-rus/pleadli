import { PreAuthLayout, ScreenHeader } from '@/components/pre-auth-layout'
import { LoaderCircleIcon, PrisonIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { m } from '@/paraglide/messages'

/** Shown when this installation's node does not answer, which is the case
 * while it starts or restarts. Not knowing what the node holds is not the
 * same as it holding nothing, so no screen that depends on that (first-run
 * setup, sign-in) may be offered. The system state is asked again every few
 * seconds and this gives way by itself. */
export function NodeWaiting() {
  return (
    <PreAuthLayout>
      <div className="flex w-full max-w-sm flex-col gap-5" role="status" aria-live="polite">
        <ScreenHeader
          icon={PrisonIcon}
          title={m.ui_waiting_for_this_installation_to_start()}
          description={m.ui_it_is_starting_or_restarting_nothing()}
        />
        <HugeiconsIcon icon={LoaderCircleIcon} className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
      </div>
    </PreAuthLayout>
  )
}
