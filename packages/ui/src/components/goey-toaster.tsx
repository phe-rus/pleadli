import type { GooeyToasterProps } from "goey-toast"
import { GooeyToaster as GooeyToasterPrimitive, gooeyToast } from "goey-toast"
import "goey-toast/styles.css"

export type {
  GooeyPromiseData,
  GooeyToastAction,
  GooeyToastClassNames, GooeyToastOptions, GooeyToastTimings
} from "goey-toast"
export type { GooeyToasterProps }

function GooeyToaster(props: GooeyToasterProps) {
  return <GooeyToasterPrimitive position="bottom-right" {...props} />
}

export { GooeyToaster, gooeyToast as t }

