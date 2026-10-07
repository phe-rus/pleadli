import { useSyncExternalStore } from 'react'

/** The model chosen in the Assist chat, kept on this computer. Empty means
 * Automatic: the provider's recommended model, with backups if it is busy. */
const KEY = 'pleadli:lawyers:assist-model'
const listeners = new Set<() => void>()
function read() {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}
let chosen = read()

export const assistModel = () => chosen
export function setAssistModel(model: string) {
  chosen = model
  try {
    localStorage.setItem(KEY, model)
  } catch {}
  listeners.forEach((l) => l())
}
export function useAssistModel() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => chosen,
  )
}
