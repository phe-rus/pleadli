import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react'
import { reportError, useErrorState } from './error-store'

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, 'render', info.componentStack ?? '')
  }
  render() {
    // The dialog says what happened. Drawing nothing here is what stops a
    // failing screen from being drawn again and again.
    return this.state.failed ? null : this.props.children
  }
}

/** Catches a screen that fails to draw. Trying again changes the key, which
 * remounts everything below with fresh state. */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { resetTick } = useErrorState()
  return <Boundary key={resetTick}>{children}</Boundary>
}

/** The router's error screen for a page that failed to load: it reports
 * instead of drawing, and asks the router to load again when the officer
 * chooses Try again. */
export function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  const { resetTick } = useErrorState()
  const first = useRef(resetTick)
  useEffect(() => reportError(error, 'route'), [error])
  useEffect(() => {
    if (resetTick !== first.current) reset()
  }, [resetTick, reset])
  return null
}
