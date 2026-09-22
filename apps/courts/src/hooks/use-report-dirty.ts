import { useStore, type AnyFormApi } from '@tanstack/react-form'
import { useEffect } from 'react'

/**
 * Reports a form's real dirty state up to whatever drawer is hosting it ,
 * the seam `Createpanel`'s `isDirty` prop reads, so closing a drawer with
 * real unsaved input asks for confirmation instead of silently discarding
 * it. Reads the form's own reactive store (the same mechanism the shared
 * Submit button already uses for its disabled state), not a second
 * hand-rolled tracker.
 */
export function useReportDirty(form: AnyFormApi, onDirtyChange?: (dirty: boolean) => void) {
  const isDirty = useStore(form.store, (state) => state.isDirty)

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])
}
