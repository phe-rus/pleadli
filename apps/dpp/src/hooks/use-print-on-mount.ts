import { useEffect } from 'react'

/** Triggers the OS print dialog once the printable content has mounted:
 * used by every `/print/...` route, which exists to be printed (or
 * "printed" to PDF via the OS dialog) immediately on arrival, not
 * browsed. A short delay lets layout settle first. */
export function usePrintOnMount() {
  useEffect(() => {
    const timeout = setTimeout(() => window.print(), 200)
    return () => clearTimeout(timeout)
  }, [])
}
