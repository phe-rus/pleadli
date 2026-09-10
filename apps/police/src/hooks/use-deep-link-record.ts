import { useEffect, useRef } from 'react'

/**
 * Opens a record's edit drawer when the route was reached with an `open`
 * search param matching one of the loaded records — the seam that lets a
 * link from elsewhere (the Person profile, eventually Search) land directly
 * on a real record instead of just its domain's list route.
 */
export function useDeepLinkRecord<T extends { id: string }>(
  records: T[] | undefined,
  open: string | undefined,
  onOpen: (record: T) => void,
) {
  const handled = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!open || handled.current === open) return
    const record = records?.find((r) => r.id === open)
    if (!record) return
    handled.current = open
    onOpen(record)
  }, [open, records, onOpen])
}
