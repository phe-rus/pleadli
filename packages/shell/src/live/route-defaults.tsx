import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import type { ShellConfig } from '../types'
import { ListSkeleton, RouteErrorView } from '../view/route-states'

/** The router's default pages for an app: a shaped skeleton while a page loads,
 * and, when it fails, what happened in plain words, what to do, and a Retry
 * button. Words come from the app's own `labels()`. */
export function createRouteDefaults(config: ShellConfig) {
  const Pending = () => <ListSkeleton label={config.labels().loading} />
  const Failed = ({ reset }: ErrorComponentProps) => {
    const router = useRouter()
    const { title, body, retry } = config.labels().error
    return (
      <RouteErrorView
        title={title}
        body={body}
        retry={retry}
        onRetry={() => {
          reset()
          void router.invalidate()
        }}
      />
    )
  }
  return { defaultPendingComponent: Pending, defaultErrorComponent: Failed }
}
