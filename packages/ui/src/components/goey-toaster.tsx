import type { GooeyToasterProps } from "goey-toast"
import { GooeyToaster as GooeyToasterPrimitive, gooeyToast } from "goey-toast"
import "goey-toast/styles.css"

export type {
  GooeyPromiseData,
  GooeyToastAction,
  GooeyToastClassNames, GooeyToastOptions, GooeyToastTimings
} from "goey-toast"
export type { GooeyToasterProps }

/**
 * The one toaster of every Pleadli app. How toasts are used here:
 *
 * - A toast confirms something that just happened (`t.success`), reports a
 *   failure with a way forward (`t.error` + `description`, or an `action`
 *   such as Retry), or tells an officer of something that needs them
 *   (`t.warning`). It is never a log: at most four wait in the queue and the
 *   oldest is dropped, so a burst cannot pile up.
 * - Anything that can fire repeatedly passes a fixed `id`, so it replaces its
 *   own toast instead of stacking, and batches what it reports.
 * - Work that takes time uses `t.promise(...)`, not a success toast after the fact.
 * - Quiet by default: no sound, no timestamp. Colours come from the app's
 *   tokens (see workspace.css), so dark mode needs no prop.
 */
function GooeyToaster(props: GooeyToasterProps) {
  return (
    <GooeyToasterPrimitive
      position="bottom-right"
      offset="44px"
      visibleToasts={3}
      maxQueue={4}
      queueOverflow="drop-oldest"
      sound={false}
      showTimestamp={false}
      closeButton="top-right"
      {...props}
    />
  )
}

export { GooeyToaster, gooeyToast as t }
