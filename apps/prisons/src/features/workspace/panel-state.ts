import { useSyncExternalStore } from 'react'

/** Whether the "Visit, court, request, more" drawer is open. The "+" menu
 * opens it and a slot in the window draws it, so the two share this. */
let moreOpen = false
const listeners = new Set<() => void>()
export const setMoreOpen = (next: boolean) => {
  moreOpen = next
  listeners.forEach((listener) => listener())
}
export const useMoreOpen = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => moreOpen,
  )

/** Ctrl J asks the assistant to open or fold; the header end slot, which holds
 * the workspace's state, answers. */
export const TOGGLE_ASSISTANT_EVENT = 'pleadli:prisons:toggle-assistant'
